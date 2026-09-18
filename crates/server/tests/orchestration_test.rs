use execution::{SafetyConfig, SimulatedExecutor};
use risk_engine::{AssetPosition, Position};
use rust_decimal::Decimal;
use std::sync::Arc;
use std::time::Duration;
use Offset_server::build_schema;
use Offset_server::config::ServerConfig;
use Offset_server::state::AppState;

#[tokio::test]
async fn test_orchestration_loop_and_graphql_flow() {
    let mut config = ServerConfig::from_env();
    config.loop_interval_secs = 1; // 1 second for fast test
    config.min_hedge_adjustment_usd = Decimal::new(100, 0);
    config.enable_live_price_feed = false; // Disable live oracle network calls for deterministic test
    config.safety = SafetyConfig {
        max_total_notional: Decimal::new(10_000_000, 0),
        max_single_order: Decimal::new(1_000_000, 0),
        max_price_staleness_secs: 30,
        kill_switch: false,
    };

    // Position at $200 SOL with $14,000 debt -> Warning level (distance 12.5%, 25% hedge ratio -> $5,000 target hedge)
    let position = Position {
        collateral: vec![AssetPosition {
            asset: "SOL".to_string(),
            amount: Decimal::new(100, 0),
            price: Decimal::new(200, 0),
            liquidation_threshold: Some(Decimal::new(80, 2)),
        }],
        debt: vec![AssetPosition {
            asset: "USDC".to_string(),
            amount: Decimal::new(14000, 0),
            price: Decimal::ONE,
            liquidation_threshold: None,
        }],
    };

    let executor = Arc::new(SimulatedExecutor::new(Decimal::new(200, 0)));
    let state = AppState::new(config, None, None, executor.clone(), position);

    // Subscribe to broadcast streams before starting loop
    let mut snapshot_rx = state.snapshot_sender.subscribe();
    let mut execution_rx = state.execution_sender.subscribe();

    // Start orchestration loop
    let loop_handle = Offset_server::orchestration::start_orchestration_loop(state.clone());

    // Wait for first snapshot to be emitted
    let first_snapshot = tokio::time::timeout(Duration::from_secs(3), snapshot_rx.recv())
        .await
        .expect("Timeout waiting for snapshot")
        .expect("Failed to receive snapshot");

    assert_eq!(
        first_snapshot.risk_level,
        Offset_server::schema::RiskLevelGql::Warning
    );
    assert_eq!(first_snapshot.target_hedge, Decimal::new(5000, 0));

    // Wait for hedge execution record to be emitted
    let first_exec = tokio::time::timeout(Duration::from_secs(3), execution_rx.recv())
        .await
        .expect("Timeout waiting for execution record")
        .expect("Failed to receive execution record");

    assert_eq!(first_exec.target_notional, Decimal::new(5000, 0));
    assert_eq!(first_exec.filled_notional, Decimal::new(5000, 0));
    assert_eq!(
        first_exec.status,
        Offset_server::schema::ExecutionStatusGql::Filled
    );

    // Build GraphQL schema and test query
    let schema = build_schema(state.clone());
    let query_res = schema
        .execute("{ currentSnapshot { riskLevel targetHedge } policy { warning { hedgeRatio } } executionStatus { killSwitchActive } }")
        .await;

    assert!(
        query_res.errors.is_empty(),
        "GraphQL errors: {:?}",
        query_res.errors
    );
    let data = query_res.data.into_json().unwrap();
    assert_eq!(data["currentSnapshot"]["riskLevel"], "WARNING");
    assert_eq!(data["currentSnapshot"]["targetHedge"], "5000.00");
    assert_eq!(data["executionStatus"]["killSwitchActive"], false);

    // Test GraphQL mutation: activating kill switch
    let mutation_res = schema
        .execute("mutation { setKillSwitch(active: true) { killSwitchActive } }")
        .await;
    assert!(
        mutation_res.errors.is_empty(),
        "Mutation errors: {:?}",
        mutation_res.errors
    );
    let mut_data = mutation_res.data.into_json().unwrap();
    assert_eq!(mut_data["setKillSwitch"]["killSwitchActive"], true);

    // Verify kill switch is now active in state
    assert!(state.safety_config.read().await.kill_switch);

    // Test on-chain obligation GraphQL query
    let obl_res = schema
        .execute("{ obligation { pubkey owner source deposits { asset depositedAmount liquidationThreshold } borrows { asset borrowedAmount } } }")
        .await;
    assert!(
        obl_res.errors.is_empty(),
        "Obligation query errors: {:?}",
        obl_res.errors
    );
    let obl_data = obl_res.data.into_json().unwrap();
    assert_eq!(obl_data["obligation"]["source"], "MockKamino");
    assert_eq!(obl_data["obligation"]["deposits"][0]["asset"], "SOL");
    assert_eq!(
        obl_data["obligation"]["deposits"][0]["depositedAmount"],
        "50000"
    );
    assert_eq!(obl_data["obligation"]["borrows"][0]["asset"], "USDC");

    // Test simulation mutation: setSimulatedPrice
    let sim_res = schema
        .execute("mutation { setSimulatedPrice(price: 180.0) { price riskLevel } }")
        .await;
    assert!(sim_res.errors.is_empty(), "Errors: {:?}", sim_res.errors);
    let sim_data = sim_res.data.into_json().unwrap();
    let sim_price: Decimal = sim_data["setSimulatedPrice"]["price"].as_str().unwrap().parse().unwrap();
    assert_eq!(sim_price, Decimal::new(180, 0));

    // Test simulation mutation: simulatePriceShock (-15%)
    let shock_res = schema
        .execute("mutation { simulatePriceShock(dropPercentage: 15.0) { price } }")
        .await;
    assert!(
        shock_res.errors.is_empty(),
        "Errors: {:?}",
        shock_res.errors
    );
    let shock_data = shock_res.data.into_json().unwrap();
    let shock_price: Decimal = shock_data["simulatePriceShock"]["price"].as_str().unwrap().parse().unwrap();
    assert_eq!(shock_price, Decimal::new(153, 0));

    // Test reset simulated price
    let reset_res = schema
        .execute("mutation { resetSimulatedPrice { price } }")
        .await;
    assert!(
        reset_res.errors.is_empty(),
        "Errors: {:?}",
        reset_res.errors
    );

    // Stop loop task
    loop_handle.abort();
}

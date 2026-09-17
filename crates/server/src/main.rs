use async_graphql::http::GraphiQLSource;
use async_graphql_axum::{GraphQLRequest, GraphQLResponse, GraphQLSubscription};
use axum::{
    response::{self, IntoResponse},
    routing::get,
    Extension, Router,
};
use data::HistoricalScenario;
use execution::SimulatedExecutor;
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tracing::{error, info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use Offset_server::config::ServerConfig;
use Offset_server::state::AppState;
use Offset_server::*;

async fn graphiql() -> impl IntoResponse {
    response::Html(
        GraphiQLSource::build()
            .endpoint("/graphql")
            .subscription_endpoint("/graphql/ws")
            .finish(),
    )
}

async fn graphql_handler(schema: Extension<AppSchema>, req: GraphQLRequest) -> GraphQLResponse {
    schema.execute(req.into_inner()).await.into()
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,offset=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("============================================================");
    info!("          OFFSET AUTOMATED LIQUIDATION DEFENSE              ");
    info!("============================================================");

    // 1. Load typed configuration
    let config = ServerConfig::from_env();
    info!(
        "Configuration: loop={}s, min_adjust=${}, max_notional=${}",
        config.loop_interval_secs,
        config.min_hedge_adjustment_usd,
        config.safety.max_total_notional
    );

    // 2. Initialize Database connection & run migrations
    let db_pool = match db::init_pool(&config.database_url).await {
        Ok(pool) => {
            info!(
                "Connected to PostgreSQL database at {}",
                config.database_url
            );
            match db::run_migrations(&pool).await {
                Ok(_) => info!("Database migrations applied successfully"),
                Err(e) => error!("Database migration error: {:?}", e),
            }

            // Seed historical scenarios if not present
            for scn_meta in HistoricalScenario::list_all() {
                if let Ok(scn) = HistoricalScenario::load(&scn_meta.id) {
                    if let Err(e) = db::upsert_scenario(&pool, &scn).await {
                        warn!("Failed to seed scenario '{}' in database: {:?}", scn.id, e);
                    }
                }
            }
            Some(pool)
        }
        Err(e) => {
            warn!(
                "Could not connect to PostgreSQL ({:?}). Running with in-memory state only.",
                e
            );
            None
        }
    };

    // 3. Initialize Redis client
    let redis_client = match redis::init_client(&config.redis_url) {
        Ok(client) => {
            info!("Initialized Redis client for URL: {}", config.redis_url);
            Some(client)
        }
        Err(e) => {
            warn!(
                "Could not initialize Redis client ({:?}). Using in-process broadcast.",
                e
            );
            None
        }
    };

    // 4. Initialize Position & Executor
    let initial_scenario = HistoricalScenario::solend_whale_2022();
    let initial_position = initial_scenario.initial_position();
    let initial_price = initial_scenario
        .prices
        .first()
        .map(|p| p.price)
        .unwrap_or_default();

    let executor = Arc::new(SimulatedExecutor::new(initial_price));

    // 5. Build AppState
    let state = AppState::new(
        config.clone(),
        db_pool,
        redis_client,
        executor,
        initial_position,
    );

    // 6. Spawn Orchestration Loop
    orchestration::start_orchestration_loop(state.clone());

    // 7. Construct GraphQL Schema
    let schema = build_schema(state.clone());

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/graphql", get(graphiql).post(graphql_handler))
        .route_service("/graphql/ws", GraphQLSubscription::new(schema.clone()))
        .layer(cors)
        .layer(Extension(schema));

    let addr = SocketAddr::from(([0, 0, 0, 0], config.server_port));
    info!("Server listening on http://{}", addr);
    info!("GraphQL Playground: http://{}/graphql", addr);
    info!("WebSocket Subscriptions: ws://{}/graphql/ws", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

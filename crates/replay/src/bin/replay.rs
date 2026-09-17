use data::HistoricalScenario;
use replay::run_replay;
use risk_engine::{HedgeTier, RiskPolicy};
use rust_decimal::Decimal;
use std::env;
use std::path::Path;
use std::process;
use std::str::FromStr;

fn print_help() {
    println!(
        r#"Offset Replay Engine — Historical Simulation CLI
Runs deterministic offline replay simulations against real historical Solana crash scenarios.

USAGE:
    replay [OPTIONS]

OPTIONS:
    -h, --help              Print this help information
    -l, --list              List all available historical scenarios
    -s, --scenario <ID>     Scenario ID to run [default: solend-whale-2022]
    -f, --file <PATH>       Load scenario from custom JSON file
    -a, --all               Run all built-in historical scenarios
    --warning <RATIO>       Warning threshold distance [default: 0.15]
    --danger <RATIO>        Danger threshold distance [default: 0.10]
    --critical <RATIO>      Critical threshold distance [default: 0.05]
    --ticks                 Print full chronological ticks table
    --csv                   Output raw ticks CSV to stdout
    --export-csv <PATH>     Save replay ticks to CSV file

AVAILABLE SCENARIOS:
    • solend-whale-2022     Solend $260M whale account liquidation crisis (Nov 2022)
    • ftx-collapse-2022     FTX crash cascading liquidation across Solana lending (Nov 2022)
    • sol-whipsaw-2023      Solana whipsaw volatility stress test (2023)

EXAMPLES:
    # Run default Solend Whale replay
    cargo run -p replay --bin replay

    # Run FTX Collapse scenario and display tick timeline
    cargo run -p replay --bin replay -- --scenario ftx-collapse-2022 --ticks

    # Run all scenarios
    cargo run -p replay --bin replay -- --all

    # Export Solend simulation to CSV
    cargo run -p replay --bin replay -- --scenario solend-whale-2022 --export-csv solend_replay.csv
"#
    );
}

fn list_scenarios() {
    println!("====================================================================================================");
    println!("Offset Replay Engine — Available Historical Scenarios");
    println!("====================================================================================================");
    let scenarios = HistoricalScenario::list_all();
    for s in scenarios {
        println!("ID:          {}", s.id);
        println!("Name:        {}", s.name);
        println!("Description: {}", s.description);
        println!("Provenance:  {}", s.source_note);
        println!("----------------------------------------------------------------------------------------------------");
    }
}

#[tokio::main]
async fn main() {
    let args: Vec<String> = env::args().collect();

    let mut scenario_id = "solend-whale-2022".to_string();
    let mut custom_file: Option<String> = None;
    let mut run_all = false;
    let mut show_ticks = false;
    let mut output_csv_stdout = false;
    let mut export_csv_path: Option<String> = None;

    let mut warning_dist = Decimal::new(15, 2);
    let mut danger_dist = Decimal::new(10, 2);
    let mut critical_dist = Decimal::new(5, 2);

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "-h" | "--help" => {
                print_help();
                process::exit(0);
            }
            "-l" | "--list" => {
                list_scenarios();
                process::exit(0);
            }
            "-s" | "--scenario" => {
                i += 1;
                if i < args.len() {
                    scenario_id = args[i].clone();
                }
            }
            "-f" | "--file" => {
                i += 1;
                if i < args.len() {
                    custom_file = Some(args[i].clone());
                }
            }
            "-a" | "--all" => {
                run_all = true;
            }
            "--ticks" => {
                show_ticks = true;
            }
            "--csv" => {
                output_csv_stdout = true;
            }
            "--export-csv" => {
                i += 1;
                if i < args.len() {
                    export_csv_path = Some(args[i].clone());
                }
            }
            "--warning" => {
                i += 1;
                if i < args.len() {
                    warning_dist = Decimal::from_str(&args[i])
                        .unwrap_or_else(|_| panic!("Invalid warning ratio: {}", args[i]));
                }
            }
            "--danger" => {
                i += 1;
                if i < args.len() {
                    danger_dist = Decimal::from_str(&args[i])
                        .unwrap_or_else(|_| panic!("Invalid danger ratio: {}", args[i]));
                }
            }
            "--critical" => {
                i += 1;
                if i < args.len() {
                    critical_dist = Decimal::from_str(&args[i])
                        .unwrap_or_else(|_| panic!("Invalid critical ratio: {}", args[i]));
                }
            }
            other => {
                eprintln!("Unknown argument: {}", other);
                print_help();
                process::exit(1);
            }
        }
        i += 1;
    }

    let policy = RiskPolicy {
        warning: HedgeTier {
            minimum_distance: warning_dist,
            hedge_ratio: Decimal::new(25, 2),
        },
        danger: HedgeTier {
            minimum_distance: danger_dist,
            hedge_ratio: Decimal::new(50, 2),
        },
        critical: HedgeTier {
            minimum_distance: critical_dist,
            hedge_ratio: Decimal::new(75, 2),
        },
    };

    if run_all {
        let scenario_ids = ["solend-whale-2022", "ftx-collapse-2022", "sol-whipsaw-2023"];
        for id in scenario_ids {
            let scenario = match HistoricalScenario::load(id) {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("Error loading scenario '{}': {}", id, e);
                    continue;
                }
            };

            let result = run_replay(&scenario, &policy).await;
            print!("{}", result.format_comparison_table());
            if show_ticks {
                print!("{}", result.format_ticks_table());
            }
        }
        return;
    }

    let scenario = if let Some(path) = &custom_file {
        match HistoricalScenario::load_from_file(Path::new(path)) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("Failed to load scenario from file '{}': {}", path, e);
                process::exit(1);
            }
        }
    } else {
        match HistoricalScenario::load(&scenario_id) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("Failed to load scenario '{}': {}", scenario_id, e);
                list_scenarios();
                process::exit(1);
            }
        }
    };

    let result = run_replay(&scenario, &policy).await;

    if output_csv_stdout {
        print!("{}", result.to_csv());
    } else {
        print!("{}", result.format_comparison_table());
        if show_ticks {
            print!("{}", result.format_ticks_table());
        }
    }

    if let Some(path) = export_csv_path {
        if let Err(e) = result.save_csv(Path::new(&path)) {
            eprintln!("Failed to write CSV to {}: {}", path, e);
            process::exit(1);
        } else if !output_csv_stdout {
            println!(
                "Successfully exported {} replay ticks to CSV: {}",
                result.ticks.len(),
                path
            );
        }
    }
}

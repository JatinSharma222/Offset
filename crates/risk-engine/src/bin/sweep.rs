use risk_engine::{format_sweep_csv, format_sweep_table, run_price_sweep, PriceSweepConfig};
use rust_decimal::Decimal;
use std::env;
use std::fs;
use std::process;
use std::str::FromStr;

fn print_help() {
    println!(
        r#"Offset Risk Engine - Price Sweep Harness
Simulates descending collateral price series to audit risk transitions and liquidation invariant.

USAGE:
    sweep [OPTIONS]

OPTIONS:
    -h, --help              Print this help information
    --asset <NAME>          Variable collateral asset name [default: SOL]
    --collateral <AMOUNT>   Collateral amount [default: 100]
    --lt <RATIO>            Liquidation threshold (e.g. 0.80) [default: 0.80]
    --debt <AMOUNT>         Debt amount in USDC [default: 14000]
    --start <PRICE>         Starting collateral price in USD [default: 250]
    --end <PRICE>           Ending collateral price in USD [default: 140]
    --step <SIZE>           Price step size in USD [default: 10]
    --csv                   Output raw CSV to stdout
    --out <FILE_PATH>       Write CSV output to file

EXAMPLES:
    # Run standard sweep and print table
    cargo run -p risk-engine --bin sweep

    # Export sweep to CSV file
    cargo run -p risk-engine --bin sweep -- --out sweep_results.csv

    # Run custom sweep with higher debt
    cargo run -p risk-engine --bin sweep -- --collateral 150 --debt 20000 --start 200 --end 100
"#
    );
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let mut config = PriceSweepConfig::default();
    let mut output_csv_stdout = false;
    let mut output_file: Option<String> = None;

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "-h" | "--help" => {
                print_help();
                process::exit(0);
            }
            "--asset" => {
                i += 1;
                if i < args.len() {
                    config.variable_asset = args[i].clone();
                }
            }
            "--collateral" => {
                i += 1;
                if i < args.len() {
                    config.collateral_amount = Decimal::from_str(&args[i])
                        .unwrap_or_else(|_| panic!("Invalid collateral amount: {}", args[i]));
                }
            }
            "--lt" => {
                i += 1;
                if i < args.len() {
                    config.liquidation_threshold = Decimal::from_str(&args[i])
                        .unwrap_or_else(|_| panic!("Invalid liquidation threshold: {}", args[i]));
                }
            }
            "--debt" => {
                i += 1;
                if i < args.len() {
                    config.debt_amount = Decimal::from_str(&args[i])
                        .unwrap_or_else(|_| panic!("Invalid debt amount: {}", args[i]));
                }
            }
            "--start" => {
                i += 1;
                if i < args.len() {
                    config.start_price = Decimal::from_str(&args[i])
                        .unwrap_or_else(|_| panic!("Invalid start price: {}", args[i]));
                }
            }
            "--end" => {
                i += 1;
                if i < args.len() {
                    config.end_price = Decimal::from_str(&args[i])
                        .unwrap_or_else(|_| panic!("Invalid end price: {}", args[i]));
                }
            }
            "--step" => {
                i += 1;
                if i < args.len() {
                    config.step_size = Decimal::from_str(&args[i])
                        .unwrap_or_else(|_| panic!("Invalid step size: {}", args[i]));
                }
            }
            "--csv" => {
                output_csv_stdout = true;
            }
            "--out" => {
                i += 1;
                if i < args.len() {
                    output_file = Some(args[i].clone());
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

    let steps = run_price_sweep(&config);

    // Invariant Verification: Liquidation price must be constant for fixed debt & collateral
    let expected_lp = if config.collateral_amount * config.liquidation_threshold > Decimal::ZERO {
        Some(config.debt_amount / (config.collateral_amount * config.liquidation_threshold))
    } else {
        None
    };

    for step in &steps {
        assert_eq!(
            step.snapshot.liquidation_price, expected_lp,
            "CRITICAL INVARIANT VIOLATION: Liquidation price shifted from {:?} to {:?} at price ${}",
            expected_lp, step.snapshot.liquidation_price, step.price
        );
    }

    if output_csv_stdout {
        print!("{}", format_sweep_csv(&steps));
    } else {
        println!("====================================================================================================");
        println!("Offset Risk Engine — Price Sweep Verification");
        println!(
            "Asset: {} | Amount: {} | LT: {} | Debt: ${}",
            config.variable_asset,
            config.collateral_amount,
            config.liquidation_threshold,
            config.debt_amount
        );
        if let Some(lp) = expected_lp {
            println!(
                "Theoretical Liquidation Price: ${:.2} (Invariant Verified Across All Steps)",
                lp
            );
        }
        println!();
        print!("{}", format_sweep_table(&steps));
        println!("Invariant Verified: Liquidation price remained strictly identical across {} price points.", steps.len());
    }

    if let Some(path) = output_file {
        let csv = format_sweep_csv(&steps);
        if let Err(e) = fs::write(&path, csv) {
            eprintln!("Failed to write CSV to {}: {}", path, e);
            process::exit(1);
        } else if !output_csv_stdout {
            println!(
                "Successfully exported {} steps to CSV: {}",
                steps.len(),
                path
            );
        }
    }
}

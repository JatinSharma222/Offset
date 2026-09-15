use sqlx::{postgres::PgPoolOptions, PgPool};
use std::env;

pub async fn init_pool() -> Result<PgPool, sqlx::Error> {
    let database_url = env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://Offset:Offset@localhost:5432/Offset".to_string());
    PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
}

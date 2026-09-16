#![allow(non_snake_case)]

pub mod config;
pub mod db;
pub mod mutation;
pub mod orchestration;
pub mod query;
pub mod redis;
pub mod schema;
pub mod state;
pub mod subscription;

use async_graphql::Schema;
use mutation::MutationRoot;
use query::QueryRoot;
use subscription::SubscriptionRoot;

pub type AppSchema = Schema<QueryRoot, MutationRoot, SubscriptionRoot>;

pub fn build_schema(state: state::AppState) -> AppSchema {
    Schema::build(QueryRoot, MutationRoot, SubscriptionRoot)
        .data(state)
        .finish()
}

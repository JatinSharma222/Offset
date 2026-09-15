pub mod db;
pub mod mutation;
pub mod query;
pub mod redis;
pub mod schema;
pub mod subscription;

use async_graphql::{http::GraphiQLSource, Schema};
use async_graphql_axum::{GraphQLRequest, GraphQLResponse, GraphQLSubscription};
use axum::{
    response::{self, IntoResponse},
    routing::get,
    Extension, Router,
};
use mutation::MutationRoot;
use query::QueryRoot;
use std::env;
use std::net::SocketAddr;
use subscription::SubscriptionRoot;
use tower_http::cors::{Any, CorsLayer};
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

pub type AppSchema = Schema<QueryRoot, MutationRoot, SubscriptionRoot>;

async fn graphiql() -> impl IntoResponse {
    response::Html(
        GraphiQLSource::build()
            .endpoint("/graphql")
            .subscription_endpoint("/graphql")
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

    info!("Starting Offset risk defense server");

    let schema = Schema::build(QueryRoot, MutationRoot, SubscriptionRoot).finish();

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/graphql", get(graphiql).post(graphql_handler))
        .route_service("/graphql/ws", GraphQLSubscription::new(schema.clone()))
        .layer(cors)
        .layer(Extension(schema));

    let port: u16 = env::var("SERVER_PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse()
        .unwrap_or(8080);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("Server listening on http://{}", addr);
    info!("GraphQL Playground: http://{}/graphql", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

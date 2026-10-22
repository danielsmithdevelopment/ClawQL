//! In-process mock REST upstream for Phase A benches (no external network).

use axum::extract::Path;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{json, Value};

async fn list_pets() -> Json<Value> {
    Json(json!({
        "pets": [
            { "id": 1, "name": "alpha", "tag": "a" },
            { "id": 2, "name": "beta", "tag": "b" },
            { "id": 3, "name": "gamma", "tag": "a" }
        ]
    }))
}

async fn get_pet(Path(pet_id): Path<String>) -> Json<Value> {
    Json(json!({ "id": pet_id, "name": format!("pet-{pet_id}"), "tag": "mock" }))
}

async fn create_pet(Json(body): Json<Value>) -> Json<Value> {
    Json(json!({ "ok": true, "created": body }))
}

pub fn router() -> Router {
    Router::new()
        .route("/pets", get(list_pets).post(create_pet))
        .route("/pets/{petId}", get(get_pet))
}

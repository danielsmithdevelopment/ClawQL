use worker::*;

#[durable_object(fetch)]
pub struct Counter {
    state: State,
}

impl DurableObject for Counter {
    fn new(state: State, _env: Env) -> Self {
        Self { state }
    }

    async fn fetch(&self, req: Request) -> Result<Response> {
        let n: u64 = self.state.storage().get("n").await.ok().flatten().unwrap_or(0);
        let n = n + 1;
        self.state.storage().put("n", &n).await?;
        let path = req.path();
        let name = path.strip_prefix("/c/").unwrap_or("");
        Response::from_json(&serde_json::json!({ "name": name, "n": n, "lang": "rust" }))
    }
}

#[event(fetch)]
async fn fetch(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let path = req.path();
    if let Some(name) = path.strip_prefix("/c/").filter(|name| !name.is_empty()) {
        let namespace = env.durable_object("COUNTER")?;
        let stub = namespace.id_from_name(name)?.get_stub()?;
        return stub.fetch_with_request(req).await;
    }
    let status = if path == "/" { 200 } else { 404 };
    Ok(
        Response::ok("celld rust demo. Try: curl http://localhost:8080/c/hello\n")?
            .with_status(status),
    )
}

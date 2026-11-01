// Copyright 2026 Deno Land Inc. Apache-2.0 license.

//! Containers attached to Durable Objects: the engine side of
//! `ctx.container`.
//!
//! A cell of a class named in the deployment's `containers` config owns at
//! most one container, named after the cell, on the node that owns the
//! cell. The Durable Object supervises it through the ops in
//! `js/container.rs`; this module performs the effects against the
//! container engine, which is the Docker Engine API on a unix socket
//! (Podman serves the same API).
//!
//! The container is bound to the cell's ownership on this node, not to its
//! residency: an idle eviction leaves it running under an inactivity timer
//! and the next activation of the same cell reconnects to it by name, which
//! is what Cloudflare does and what the `@cloudflare/containers` class's
//! `sleepAfter` alarm relies on. Every other stop destroys it. The
//! container's disk is ephemeral on Cloudflare too, so a takeover that
//! starts fresh is conformant.
//!
//! Images travel through the bucket. `celld deploy` saves the image the
//! config names as a tar at `deploy/images/<id>.tar`, and a node loads it
//! into its engine the first time a cell of that class starts, so a node
//! never talks to a registry.

use crate::asyncrt;
use crate::docker::{frame_header, Docker, Stream};
use anyhow::{anyhow, Context};
use bytes::Bytes;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock, RwLock};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::{mpsc, watch};

/// One `containers[]` entry of a deployment, as the node sees it.
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ContainerSpec {
    pub class_name: String,
    /// The image reference the engine starts, `celld-image:<content key>`,
    /// so two deployments of one image share one tar and one load.
    pub image: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub instance_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_instances: Option<u64>,
    /// The OCI runtime this class runs under, such as `runsc` (gVisor) for
    /// untrusted code. Overrides the node's `CELLD_CONTAINER_RUNTIME` for
    /// this class; `None` takes the node default. A node whose daemon does
    /// not have the runtime fails every start of the class, so the class
    /// runs only where its isolation is available. celld extends the
    /// Cloudflare config here, which has no per-class runtime.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub runtime: Option<String>,
}

/// The reference every engine holds an image under, from its content key.
/// The key hashes the layer digests and the image config, so an engine
/// that rebuilds identical content under a new id still resolves it.
pub fn image_reference(key: &str) -> String {
    format!("celld-image:{key}")
}

/// The bucket key of one saved image, from its reference.
pub fn image_key(image: &str) -> String {
    format!(
        "deploy/images/{}.tar",
        image.trim_start_matches("celld-image:")
    )
}

/// The resources an instance type reserves. Cloudflare's published table;
/// a name outside it is refused at deploy.
pub fn instance_resources(instance_type: &str) -> Option<(f64, u64)> {
    let gib = 1024 * 1024 * 1024;
    Some(match instance_type {
        "lite" | "dev" => (1.0 / 16.0, 256 * 1024 * 1024),
        "basic" => (0.25, gib),
        "standard-1" | "standard" => (0.5, 4 * gib),
        "standard-2" => (1.0, 6 * gib),
        "standard-3" => (2.0, 8 * gib),
        "standard-4" => (4.0, 12 * gib),
        _ => return None,
    })
}

/// The instance type of a class that declares none, as on Cloudflare.
const DEFAULT_INSTANCE_TYPE: &str = "dev";

/// The resolvers a container gets when it runs under a non-default runtime
/// and the operator set none. gVisor's network stack does not reach
/// Docker's embedded resolver at `127.0.0.11`, so a container under it
/// cannot resolve a hostname though it reaches the Internet by address; a
/// public resolver, which the fence permits, restores name resolution.
/// `CELLD_CONTAINER_DNS` overrides this.
const DEFAULT_CONTAINER_DNS: &[&str] = &["1.1.1.1", "1.0.0.1"];

/// The memory a container of this instance type reserves on the node. A
/// class that declares none gets the default type, as `create_and_start`
/// does. An unknown name is refused at deploy, so a running container
/// always maps; this returns 0 for a name that somehow does not, which
/// undercounts rather than blocks a sample.
pub fn instance_memory_bytes(instance_type: Option<&str>) -> u64 {
    instance_resources(instance_type.unwrap_or(DEFAULT_INSTANCE_TYPE))
        .map(|(_, memory)| memory)
        .unwrap_or(0)
}

/// The memory this node commits to its running containers, for the node's
/// capacity accounting. Zero when no engine has connected. See
/// `celld_logic::pressure::Load::container_reserved_bytes` for why the node
/// counts the cap rather than the container's live usage.
pub fn reserved_memory_bytes() -> u64 {
    engine_if_ready().map_or(0, |engine| engine.reserved_memory_bytes())
}

/// This node's running containers per class, published in the node lease so
/// peers can sum a class's instances across the fleet for `max_instances`.
/// Empty when no engine has connected.
pub fn running_instances_by_class() -> std::collections::BTreeMap<String, u64> {
    engine_if_ready().map_or_else(Default::default, |engine| {
        engine.running_instances_by_class()
    })
}
/// Processes one container can hold. Cloudflare publishes no number; this
/// is room for a build tool's process tree and far short of a fork bomb.
const PIDS_LIMIT: u64 = 1024;
/// The host interfaces of the two bridges, named so the fence can address
/// them; Docker's default `br-<id>` changes with every recreation.
const OPEN_BRIDGE: &str = "celld0";
const INTERNAL_BRIDGE: &str = "celld1";
const BRIDGE_NAME_OPTION: &str = "com.docker.network.bridge.name";
/// The fence, installed on the node from a one-shot privileged container of
/// the `celld-fence` image: a container may reach the Internet and nothing
/// of the node's own. Hooks before Docker's own chains (priority filter -
/// 10) so a verdict here is final. Input: no new connection from a bridge
/// to the node itself, which is where the internal listener and the public
/// listener bind; replies to connections the node opened still pass.
/// Forward: nothing to the private ranges, where the fleet, the VPC, and
/// the metadata service live. Rules on the host side of the bridge cover
/// every runtime, gVisor included, and no process inside a container can
/// see them, let alone remove them.
const FENCE_RULES: &str = r#"table inet celld
delete table inet celld
table inet celld {
  chain input {
    type filter hook input priority -10; policy accept;
    iifname { "celld0", "celld1" } ct state established,related accept
    iifname { "celld0", "celld1" } reject
  }
  chain forward {
    type filter hook forward priority -10; policy accept;
    iifname { "celld0", "celld1" } ip daddr { 169.254.0.0/16, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 100.64.0.0/10 } reject
    iifname { "celld0", "celld1" } ip6 daddr { fe80::/10, fc00::/7 } reject
  }
}
"#;

/// Docker's bridge option that forbids traffic between two containers on
/// the same bridge. The node still reaches every container, because it
/// speaks from the host side of the bridge.
const ICC_OPTION: &str = "com.docker.network.bridge.enable_icc";

/// How a cell stop treats its container.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Release {
    /// An idle eviction: keep the container under its inactivity timer.
    Keep,
    /// Ownership leaves this node, or the cell is reset: destroy it.
    Destroy,
}

/// The default inactivity window after an idle eviction when the object
/// never set one. The `@cloudflare/containers` alarm wakes the object well
/// inside this to enforce `sleepAfter`, so this is the backstop for an
/// object that never wakes, not the policy.
const DEFAULT_INACTIVITY: Duration = Duration::from_secs(10 * 60);

/// Environment every container sees. The values mirror workerd's local
/// engine: applications read the names, never the values.
const DEFAULT_ENV: &[&str] = &[
    "CLOUDFLARE_COUNTRY_A2=XX",
    "CLOUDFLARE_DEPLOYMENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "CLOUDFLARE_LOCATION=loc01",
    "CLOUDFLARE_REGION=REGN",
    "CLOUDFLARE_APPLICATION_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
];

pub struct StartParams {
    pub entrypoint: Option<Vec<String>>,
    pub env: Vec<(String, String)>,
    pub enable_internet: bool,
    pub labels: Vec<(String, String)>,
}

#[derive(Default)]
struct CellState {
    running: bool,
    /// Where the node dials the container: the bridge address on Linux,
    /// the published loopback ports elsewhere.
    address: Address,
    inactivity: Option<Duration>,
    /// The pending destroy after an idle eviction. Dropping it cancels.
    sweeper: Option<asyncrt::TaskHandle<()>>,
    /// Bumped per start so a wait from a previous run cannot report for
    /// this one.
    run: u64,
}

#[derive(Clone, Debug, Default)]
enum Address {
    #[default]
    None,
    Ip(String),
    Published(HashMap<u16, u16>),
}

pub struct CellContainer {
    scope: String,
    name: String,
    spec: Arc<ContainerSpec>,
    state: Mutex<CellState>,
    /// Processes `exec()` started in this container. An object drops one
    /// after `output()`; the rest go with the container.
    processes: Mutex<Vec<u64>>,
    /// The exit of the current run, `None` while it runs. `Some(Err)` is
    /// an engine failure the wait could not attribute to the process.
    /// Written with `send_replace`: a plain `send` discards the value
    /// while nobody subscribes, and `monitor()` usually subscribes late.
    exit: watch::Sender<Option<(u64, Result<i64, String>)>>,
}

impl CellContainer {
    pub fn running(&self) -> bool {
        self.state.lock().unwrap().running
    }

    /// `host:port` for `getTcpPort(port)`.
    pub fn address(&self, port: u16) -> Result<String, String> {
        let state = self.state.lock().unwrap();
        if !state.running {
            return Err("the container is not running".to_string());
        }
        match &state.address {
            Address::Ip(ip) => Ok(format!("{ip}:{port}")),
            Address::Published(ports) => ports
                .get(&port)
                .map(|host| format!("127.0.0.1:{host}"))
                .ok_or_else(|| {
                    format!(
                        "The container is not listening on port {port}: on this platform a port \
                         must be declared with EXPOSE in the image"
                    )
                }),
            Address::None => Err(format!("The container is not listening on port {port}")),
        }
    }

    pub fn set_inactivity(&self, duration: Duration) {
        self.state.lock().unwrap().inactivity = Some(duration);
    }

    /// Open the next run, synchronously, before the start is even queued.
    /// The object's `start()` returns at once and its `monitor()` follows
    /// immediately, so the run they both mean must exist before either
    /// effect runs, or the monitor would find the previous run's exit and
    /// report the new container dead on arrival.
    pub fn begin_run(&self) -> u64 {
        let mut state = self.state.lock().unwrap();
        state.run += 1;
        state.running = true;
        state.address = Address::None;
        let run = state.run;
        drop(state);
        self.exit.send_replace(None);
        run
    }

    /// The run `monitor()` waits on: the newest one.
    pub fn current_run(&self) -> u64 {
        self.state.lock().unwrap().run
    }
}

pub struct ContainerEngine {
    /// See `Config::runtime`.
    runtime: Option<String>,
    /// See `Config::dns`.
    dns: Vec<String>,
    /// The absolute path of the container resolv.conf this engine wrote and
    /// bind-mounts; `None` when it could not be written.
    resolv_conf: Option<PathBuf>,
    docker: Docker,
    node: String,
    bucket: Option<crate::bucket::Bucket>,
    /// Per-image load lock, so two cells of one class starting together
    /// load the tar once.
    images: Mutex<HashMap<String, Arc<tokio::sync::Mutex<bool>>>>,
    cells: Mutex<HashMap<String, Arc<CellContainer>>>,
    networks: tokio::sync::Mutex<Option<(String, String)>>,
    /// Whether this process has installed the fence on the node's bridges.
    fenced: tokio::sync::Mutex<bool>,
}

/// What the runtime told this module about the node: set once at start.
struct Config {
    node: String,
    bucket: Option<crate::bucket::Bucket>,
    /// `CELLD_CONTAINER_RUNTIME`: the OCI runtime every container starts
    /// under, such as `runsc` (gVisor) or `kata` (a VM). `None` is the
    /// daemon's default, which is `runc` unless the operator changed it. A
    /// class can override it, see `ContainerSpec::runtime`.
    runtime: Option<String>,
    /// `CELLD_CONTAINER_DNS`: the resolvers a container gets, overriding
    /// `DEFAULT_CONTAINER_DNS`. Empty takes the default when a runtime is in
    /// use and the daemon's otherwise.
    dns: Vec<String>,
    /// The node's state directory. celld writes the container resolv.conf
    /// here and bind-mounts it, so the path must be the same on the host as
    /// celld sees it; a self-hosted node runs celld as a host process, and
    /// the lab mounts the directory one-to-one.
    data_dir: PathBuf,
}

static CONFIG: RwLock<Option<Config>> = RwLock::new(None);
/// The deployment's container classes. Replaced on every generation swap;
/// a running container keeps the spec it started with.
static SPECS: RwLock<Vec<Arc<ContainerSpec>>> = RwLock::new(Vec::new());
/// The deployment's `celld-fence` image; see `Manifest::fence_image`.
static FENCE_IMAGE: RwLock<Option<String>> = RwLock::new(None);
/// The engine, connected on first use. A node whose deployment declares no
/// container class never opens the socket.
static ENGINE: tokio::sync::OnceCell<Arc<ContainerEngine>> = tokio::sync::OnceCell::const_new();

pub fn configure(node: String, bucket: Option<crate::bucket::Bucket>, data_dir: PathBuf) {
    let runtime = std::env::var("CELLD_CONTAINER_RUNTIME")
        .ok()
        .filter(|runtime| !runtime.is_empty());
    let dns = std::env::var("CELLD_CONTAINER_DNS")
        .unwrap_or_default()
        .split(',')
        .map(|resolver| resolver.trim().to_string())
        .filter(|resolver| !resolver.is_empty())
        .collect();
    *CONFIG.write().unwrap() = Some(Config {
        node,
        bucket,
        runtime,
        dns,
        data_dir,
    });
}

pub fn install_specs(specs: Vec<ContainerSpec>, fence_image: Option<String>) {
    *SPECS.write().unwrap() = specs.into_iter().map(Arc::new).collect();
    *FENCE_IMAGE.write().unwrap() = fence_image;
}

pub fn spec(class: &str) -> Option<Arc<ContainerSpec>> {
    SPECS
        .read()
        .unwrap()
        .iter()
        .find(|spec| spec.class_name == class)
        .cloned()
}

/// The engine, connecting on the first call. A failure is returned rather
/// than cached, so a daemon that comes up later is found by the next call.
pub async fn engine() -> anyhow::Result<Arc<ContainerEngine>> {
    ENGINE
        .get_or_try_init(|| async {
            let (node, bucket, runtime, dns, data_dir) = {
                let config = CONFIG.read().unwrap();
                let config = config.as_ref().ok_or_else(|| {
                    anyhow!("the container engine is not configured on this node")
                })?;
                (
                    config.node.clone(),
                    config.bucket.clone(),
                    config.runtime.clone(),
                    config.dns.clone(),
                    config.data_dir.clone(),
                )
            };
            let docker = Docker::discover().ok_or_else(|| {
                anyhow!(
                    "no container engine: set DOCKER_HOST to a unix socket, or run a Docker or \
                     Podman daemon on this node"
                )
            })?;
            Ok(Arc::new(
                ContainerEngine::connect(docker, node, bucket, runtime, dns, data_dir).await?,
            ))
        })
        .await
        .cloned()
}

/// The engine only if a previous call connected it.
pub fn engine_if_ready() -> Option<Arc<ContainerEngine>> {
    ENGINE.get().cloned()
}

/// Destroy every container of this node at process exit. A preserve
/// shutdown (`celld dev` on Ctrl-C) keeps its cells resident and stops
/// none of them, and a handoff cut by the deadline leaves cells behind
/// too; without this their containers ran on until the next start of the
/// same node reaped them, invisible to the object that owned them.
pub async fn shutdown() {
    let Some(engine) = engine_if_ready() else {
        return;
    };
    if let Err(error) = engine.reap().await {
        tracing::warn!(
            event = "container_shutdown_reap_failed",
            error = %format!("{error:#}"),
            "containers of this node may still be running"
        );
    }
}

/// Connect and load every image of the installed specs, ahead of the
/// first cell that needs one. Failures are logged: a node without an
/// engine still serves every other class, and the container class fails
/// at its first `start()` with the same message.
pub async fn prewarm() {
    let engine = match engine().await {
        Ok(engine) => engine,
        Err(error) => {
            tracing::warn!(error = %format!("{error:#}"), "containers are unavailable on this node");
            return;
        }
    };
    if let Err(error) = engine.ensure_fence().await {
        tracing::warn!(
            error = %format!("{error:#}"),
            "the container bridges are not fenced; no container starts on this node"
        );
    }
    let specs = SPECS.read().unwrap().clone();
    for spec in specs {
        if let Err(error) = engine.ensure_image(&spec.image).await {
            tracing::warn!(
                class = %spec.class_name,
                image = %spec.image,
                error = %format!("{error:#}"),
                "container image is unavailable"
            );
        }
    }
}

impl ContainerEngine {
    /// Connect to the engine and reap every container a previous process
    /// of this node left behind. A restarted node cannot know which of its
    /// containers still belong to cells it will own again, and a container
    /// whose object has lost track of it is a leak, so a restart starts
    /// clean. The next `start()` of each object creates a fresh one.
    pub async fn connect(
        docker: Docker,
        node: String,
        bucket: Option<crate::bucket::Bucket>,
        runtime: Option<String>,
        dns: Vec<String>,
        data_dir: PathBuf,
    ) -> anyhow::Result<Self> {
        // Write the resolv.conf once, to bind into every container that runs
        // under a non-default runtime. gVisor cannot reach Docker's embedded
        // resolver, so a bind-mounted file with a public resolver, which the
        // fence permits, is the only resolv.conf the container can use.
        let resolvers: Vec<String> = if dns.is_empty() {
            DEFAULT_CONTAINER_DNS
                .iter()
                .map(|r| r.to_string())
                .collect()
        } else {
            dns.clone()
        };
        let resolv_conf = {
            let path = data_dir.join("container-resolv.conf");
            let body: String = resolvers
                .iter()
                .map(|resolver| format!("nameserver {resolver}\n"))
                .collect();
            let fs = asyncrt::fs();
            match fs
                .create_dir_all(&data_dir)
                .and_then(|()| fs.write(&path, body.as_bytes()))
            {
                Ok(()) => Some(path),
                Err(error) => {
                    tracing::warn!(event = "container_resolv_write_failed", %error);
                    None
                }
            }
        };
        let engine = Self {
            docker,
            node,
            bucket,
            runtime,
            dns,
            resolv_conf,
            images: Mutex::new(HashMap::new()),
            cells: Mutex::new(HashMap::new()),
            networks: tokio::sync::Mutex::new(None),
            fenced: tokio::sync::Mutex::new(false),
        };
        engine.reap().await?;
        Ok(engine)
    }

    pub fn socket(&self) -> &std::path::Path {
        self.docker.socket()
    }

    async fn reap(&self) -> anyhow::Result<()> {
        let filters = json!({ "label": [format!("celld.node={}", self.node)] }).to_string();
        let reply = self
            .docker
            .expect(
                "GET",
                &format!(
                    "/containers/json?all=true&filters={}",
                    percent_encoding::utf8_percent_encode(
                        &filters,
                        percent_encoding::NON_ALPHANUMERIC
                    )
                ),
                None,
                "list containers",
            )
            .await?;
        let list = reply.json()?;
        for entry in list.as_array().into_iter().flatten() {
            if let Some(id) = entry.get("Id").and_then(Value::as_str) {
                let _ = self
                    .docker
                    .call("DELETE", &format!("/containers/{id}?force=true"), None)
                    .await;
            }
        }
        Ok(())
    }

    /// Make the class's image present in the engine, loading it from the
    /// bucket when it is not. Idempotent and serialized per image.
    pub async fn ensure_image(&self, image: &str) -> anyhow::Result<()> {
        let lock = self
            .images
            .lock()
            .unwrap()
            .entry(image.to_string())
            .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(false)))
            .clone();
        let mut loaded = lock.lock().await;
        if *loaded {
            return Ok(());
        }
        let reply = self
            .docker
            .call("GET", &format!("/images/{image}/json"), None)
            .await?;
        if reply.status.is_success() {
            tracing::info!(image, "container image present in the engine");
            *loaded = true;
            return Ok(());
        }
        let bucket = self
            .bucket
            .as_ref()
            .ok_or_else(|| anyhow!("image {image} is not present in the container engine"))?;
        let key = image_key(image);
        let (tar, _) = bucket.get(&key).await?.ok_or_else(|| {
            anyhow!("image {image} is not in the bucket at {key}; run `celld deploy`")
        })?;
        let bytes = tar.len();
        let reply = self
            .docker
            .post_octets("/images/load?quiet=true", tar, "load image")
            .await?;
        tracing::info!(
            image,
            bytes,
            answer = %String::from_utf8_lossy(&reply.body).trim_end(),
            "container image loaded from the bucket"
        );
        *loaded = true;
        Ok(())
    }

    /// The two bridges every container joins: one with egress, one
    /// without. Docker implements an internal network by omitting the
    /// masquerade rule and the default route; the node still reaches the
    /// bridge address, which is all ingress needs.
    async fn networks(&self) -> anyhow::Result<(String, String)> {
        let mut guard = self.networks.lock().await;
        if let Some(names) = guard.as_ref() {
            return Ok(names.clone());
        }
        for (name, internal) in [("celld", false), ("celld-internal", true)] {
            // A bridge keeps the options it was created with, so one from
            // before containers were isolated from each other is replaced.
            // The replacement fails while a container is attached, which a
            // node start after its reap never has; a failure keeps the old
            // bridge and says so rather than refusing every container.
            let current = self
                .docker
                .call("GET", &format!("/networks/{name}"), None)
                .await?;
            if current.status.is_success() {
                let bridge = if internal {
                    INTERNAL_BRIDGE
                } else {
                    OPEN_BRIDGE
                };
                let current_options = current
                    .json()
                    .ok()
                    .and_then(|network| network.get("Options").cloned())
                    .unwrap_or(Value::Null);
                let option = |key: &str| current_options.get(key).and_then(Value::as_str);
                if option(ICC_OPTION) == Some("false") && option(BRIDGE_NAME_OPTION) == Some(bridge)
                {
                    continue;
                }
                let removed = self
                    .docker
                    .call("DELETE", &format!("/networks/{name}"), None)
                    .await?;
                if !removed.status.is_success() {
                    tracing::warn!(
                        network = name,
                        error = %removed.message(),
                        "the container bridge predates container isolation and is in use; \
                         containers on it can reach each other until the node restarts idle"
                    );
                    continue;
                }
            }
            let reply = self
                .docker
                .call(
                    "POST",
                    "/networks/create",
                    Some(json!({
                        "Name": name,
                        "Driver": "bridge",
                        "Internal": internal,
                        "Options": {
                            ICC_OPTION: "false",
                            BRIDGE_NAME_OPTION: if internal { INTERNAL_BRIDGE } else { OPEN_BRIDGE },
                        },
                    })),
                )
                .await?;
            // 409: it exists, which is the steady state.
            if !reply.status.is_success() && reply.status.as_u16() != 409 {
                return Err(anyhow!(
                    "create network {name} failed with [{}] {}",
                    reply.status.as_u16(),
                    reply.message()
                ));
            }
        }
        let names = ("celld".to_string(), "celld-internal".to_string());
        *guard = Some(names.clone());
        Ok(names)
    }

    /// Install the fence on the node's bridges, once per process. Every
    /// container start waits on this and fails when it fails: a node that
    /// cannot fence its bridges runs no container, because an unfenced
    /// container can reach the node's internal listener and the cloud's
    /// metadata service. The rules live in the kernel and outlive this
    /// process; a restart re-applies them, which is idempotent.
    pub async fn ensure_fence(&self) -> anyhow::Result<()> {
        let mut fenced = self.fenced.lock().await;
        if *fenced {
            return Ok(());
        }
        let image = FENCE_IMAGE.read().unwrap().clone().ok_or_else(|| {
            anyhow!(
                "this deployment has no fence image; deploy it again with this celld, which \
                 saves the celld-fence image beside the container images"
            )
        })?;
        self.ensure_image(&image).await?;
        self.networks().await?;
        let body = json!({
            "Image": image,
            "Env": [format!("CELLD_NFT={FENCE_RULES}")],
            "Cmd": ["sh", "-c", "printf '%s' \"$CELLD_NFT\" | nft -f -"],
            "Labels": { "celld.node": self.node, "celld.fence": "1" },
            "HostConfig": { "NetworkMode": "host", "CapAdd": ["NET_ADMIN"] },
        });
        let created = self
            .docker
            .expect(
                "POST",
                "/containers/create",
                Some(body),
                "create fence container",
            )
            .await?
            .json()?;
        let id = created
            .get("Id")
            .and_then(Value::as_str)
            .ok_or_else(|| anyhow!("create fence container answered without an id"))?
            .to_string();
        let outcome = async {
            self.docker
                .expect(
                    "POST",
                    &format!("/containers/{id}/start"),
                    None,
                    "start fence container",
                )
                .await?;
            let waited = self
                .docker
                .expect(
                    "POST",
                    &format!("/containers/{id}/wait"),
                    None,
                    "wait fence container",
                )
                .await?
                .json()?;
            let code = waited
                .get("StatusCode")
                .and_then(Value::as_i64)
                .unwrap_or(-1);
            if code != 0 {
                let logs = self.logs(&id).await.unwrap_or_default();
                return Err(anyhow!(
                    "the fence container exited with {code}: {}",
                    logs.trim()
                ));
            }
            Ok(())
        }
        .await;
        let _ = self
            .docker
            .call("DELETE", &format!("/containers/{id}?force=true"), None)
            .await;
        outcome.context("fence the container bridges")?;
        tracing::info!(
            event = "container_bridges_fenced",
            bridges = format!("{OPEN_BRIDGE},{INTERNAL_BRIDGE}"),
            "containers can reach the Internet and nothing of the node's own"
        );
        *fenced = true;
        Ok(())
    }

    /// Both output streams of a stopped container, for an error message.
    async fn logs(&self, id: &str) -> anyhow::Result<String> {
        let reply = self
            .docker
            .expect(
                "GET",
                &format!("/containers/{id}/logs?stdout=true&stderr=true"),
                None,
                "container logs",
            )
            .await?;
        let mut text = Vec::new();
        let mut rest: &[u8] = &reply.body;
        while rest.len() >= 8 {
            let (_, length) = frame_header(rest[..8].try_into().unwrap());
            let end = (8 + length).min(rest.len());
            text.extend_from_slice(&rest[8..end]);
            rest = &rest[end..];
        }
        Ok(String::from_utf8_lossy(&text).into_owned())
    }

    /// The cell's container handle, adopting a container a previous
    /// activation on this node left running. Called at cell start for a
    /// class with a spec; the object's `running` reads the answer.
    pub async fn attach(&self, scope: &str, class: &str) -> anyhow::Result<Arc<CellContainer>> {
        let spec = spec(class).ok_or_else(|| anyhow!("class {class} has no container"))?;
        let cell = {
            let mut cells = self.cells.lock().unwrap();
            let cell = cells.entry(scope.to_string()).or_insert_with(|| {
                Arc::new(CellContainer {
                    scope: scope.to_string(),
                    name: container_name(&self.node, scope),
                    spec,
                    state: Mutex::new(CellState::default()),
                    processes: Mutex::new(Vec::new()),
                    exit: watch::channel(None).0,
                })
            });
            // A returning cell cancels the destroy its eviction armed.
            cell.state.lock().unwrap().sweeper = None;
            cell.clone()
        };
        let running = self.inspect_running(&cell).await?;
        // A container this handle did not start, left running by an
        // earlier owner of the name: give it a run so `monitor()` has an
        // exit to wait for. The run opens before the address lands, because
        // opening one clears it.
        let adopted = running.is_some() && !cell.running();
        if adopted {
            let run = cell.begin_run();
            self.watch_exit(&cell, run);
        }
        let mut state = cell.state.lock().unwrap();
        state.running = running.is_some();
        state.address = running.unwrap_or_default();
        drop(state);
        Ok(cell)
    }

    /// The cell's handle, if the cell started on this node.
    pub fn cell(&self, scope: &str) -> Option<Arc<CellContainer>> {
        self.cells.lock().unwrap().get(scope).cloned()
    }

    /// The memory the node's running containers reserve, summed over their
    /// instance-type caps. A cell whose container is not running reserves
    /// nothing: a stopped container holds no memory, and an idle eviction
    /// stops it before the sample would count it.
    pub fn reserved_memory_bytes(&self) -> u64 {
        self.cells
            .lock()
            .unwrap()
            .values()
            .filter(|cell| cell.running())
            .map(|cell| instance_memory_bytes(cell.spec.instance_type.as_deref()))
            .sum()
    }

    /// This node's running containers per class.
    fn running_instances_by_class(&self) -> std::collections::BTreeMap<String, u64> {
        let mut counts = std::collections::BTreeMap::new();
        for cell in self.cells.lock().unwrap().values() {
            if cell.running() {
                *counts.entry(cell.spec.class_name.clone()).or_insert(0) += 1;
            }
        }
        counts
    }

    /// Refuse a start that would put the class over its fleet-wide
    /// `max_instances`. The fleet count is this node's own running
    /// containers of the class, read live, plus every peer's count from the
    /// shared capacity sample; `begin_run` already marked the starting cell
    /// running, so the live count includes it. A class with no
    /// `max_instances`, or a node with no bucket to read the sample from as
    /// under `celld dev`, has no fleet ceiling. See
    /// [`crate::ownership_store::fleet_class_instances`] for the staleness
    /// the sample admits.
    async fn enforce_instance_ceiling(&self, cell: &CellContainer) -> anyhow::Result<()> {
        let Some(max) = cell.spec.max_instances else {
            return Ok(());
        };
        let class = &cell.spec.class_name;
        let here = self
            .cells
            .lock()
            .unwrap()
            .values()
            .filter(|other| other.running() && other.spec.class_name == *class)
            .count() as u64;
        let elsewhere = match &self.bucket {
            Some(bucket) => {
                crate::ownership_store::fleet_class_instances(bucket, class, &self.node).await
            }
            None => 0,
        };
        anyhow::ensure!(
            here + elsewhere <= max,
            "container class {class} is at its max_instances limit of {max}: \
             {here} on this node and {elsewhere} on other nodes",
        );
        Ok(())
    }

    async fn inspect_running(&self, cell: &CellContainer) -> anyhow::Result<Option<Address>> {
        let reply = self
            .docker
            .call("GET", &format!("/containers/{}/json", cell.name), None)
            .await?;
        if reply.status.as_u16() == 404 {
            return Ok(None);
        }
        if !reply.status.is_success() {
            return Err(anyhow!(
                "inspect container failed with [{}] {}",
                reply.status.as_u16(),
                reply.message()
            ));
        }
        let info = reply.json()?;
        let running = info
            .pointer("/State/Running")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        Ok(running.then(|| address_of(&info)))
    }

    /// Start the cell's container. The object's `start()` returns before
    /// this completes, as on Cloudflare; a failure surfaces through
    /// `monitor()`.
    /// Start the cell's container for the run `begin_run` opened. The
    /// object's `start()` returns before this completes, as on Cloudflare;
    /// a failure surfaces through `monitor()`.
    pub async fn start(
        &self,
        cell: &Arc<CellContainer>,
        run: u64,
        params: StartParams,
    ) -> anyhow::Result<()> {
        let started = self.create_and_start(cell, params).await;
        let address = match started {
            Ok(address) => address,
            Err(error) => {
                // `start()` is fire-and-forget for the object, and its
                // `monitor()` sees this error only if it was already
                // waiting; say it here too, or a start that fails fast
                // leaves no trace anywhere.
                tracing::warn!(
                    event = "container_start_failed",
                    cell = %cell.scope,
                    error = %format!("{error:#}"),
                    "the container did not start"
                );
                let mut state = cell.state.lock().unwrap();
                state.running = false;
                drop(state);
                cell.exit
                    .send_replace(Some((run, Err(format!("{error:#}")))));
                return Err(error);
            }
        };
        {
            let mut state = cell.state.lock().unwrap();
            state.running = true;
            state.address = address;
        }
        self.watch_exit(cell, run);
        Ok(())
    }

    /// Wait for the container's root process to end and publish the exit
    /// for `run`; a later run's start has already replaced the state.
    fn watch_exit(&self, cell: &Arc<CellContainer>, run: u64) {
        let docker = self.docker.clone();
        let cell_ = cell.clone();
        asyncrt::spawn(async move {
            let result = docker
                .call("POST", &format!("/containers/{}/wait", cell_.name), None)
                .await
                .and_then(|reply| {
                    if !reply.status.is_success() {
                        return Err(anyhow!(
                            "wait failed with [{}] {}",
                            reply.status.as_u16(),
                            reply.message()
                        ));
                    }
                    reply
                        .json()?
                        .get("StatusCode")
                        .and_then(Value::as_i64)
                        .ok_or_else(|| anyhow!("wait answered without a status code"))
                })
                .map_err(|error| format!("{error:#}"));
            let mut state = cell_.state.lock().unwrap();
            if state.run == run {
                state.running = false;
                state.address = Address::None;
            }
            drop(state);
            cell_.exit.send_replace(Some((run, result)));
        })
        .detach();
    }

    async fn create_and_start(
        &self,
        cell: &CellContainer,
        params: StartParams,
    ) -> anyhow::Result<Address> {
        self.ensure_fence().await?;
        self.enforce_instance_ceiling(cell).await?;
        self.ensure_image(&cell.spec.image).await?;
        let (open, internal) = self.networks().await?;
        // A previous run's container may still be named: the wait task
        // observed its exit but nothing removed it, or a restart adopted a
        // stopped one. The name is the cell's, so it is ours to remove.
        let _ = self
            .docker
            .call(
                "DELETE",
                &format!("/containers/{}?force=true", cell.name),
                None,
            )
            .await;
        let mut env: Vec<String> = DEFAULT_ENV.iter().map(|entry| entry.to_string()).collect();
        env.push(format!("CLOUDFLARE_DURABLE_OBJECT_ID={}", cell.scope));
        env.extend(
            params
                .env
                .iter()
                .map(|(name, value)| format!("{name}={value}")),
        );
        let mut labels = serde_json::Map::new();
        labels.insert("celld.node".into(), json!(self.node));
        labels.insert("celld.cell".into(), json!(cell.scope));
        labels.insert("celld.class".into(), json!(cell.spec.class_name));
        for (name, value) in &params.labels {
            labels.insert(format!("celld.user.{name}"), json!(value));
        }
        // Off Linux the node reaches a container only through published
        // ports, and Docker publishes nothing on an internal network, so
        // `enableInternet: false` would make the container unreachable.
        // Development there keeps egress; the compat page says so.
        let offline = !params.enable_internet && cfg!(target_os = "linux");
        if !params.enable_internet && !offline {
            tracing::warn!(
                cell = %cell.scope,
                "enableInternet: false is not enforced on this platform; the container keeps egress"
            );
        }
        // A container is a tenant's process tree, not the operator's: no
        // capability, no privilege gain through setuid binaries, the
        // daemon's seccomp profile, and a process ceiling. What a class
        // legitimately needs beyond this is a config question for later,
        // not a default. The kernel boundary itself is the runtime's.
        let mut host_config = json!({
            "NetworkMode": if offline { &internal } else { &open },
            "PublishAllPorts": !cfg!(target_os = "linux"),
            "CapDrop": ["ALL"],
            "SecurityOpt": ["no-new-privileges"],
            "PidsLimit": PIDS_LIMIT,
            // An init as PID 1 reaps orphaned children. Without it a process
            // whose parent exits becomes a zombie the container holds until
            // it stops, and enough of them exhaust the PID ceiling; a fleet
            // fork bomb left exactly these behind.
            "Init": true,
        });
        // A class can name its own runtime, else the node default. A class
        // that needs isolation names `runsc`, and the node's daemon must
        // have it or the start fails, so the class runs only where its
        // isolation is real.
        let runtime = cell
            .spec
            .runtime
            .as_deref()
            .or(self.runtime.as_deref())
            .filter(|runtime| !runtime.is_empty());
        if let Some(runtime) = runtime {
            host_config["Runtime"] = json!(runtime);
        }
        // A container under a non-default runtime gets an explicit resolver
        // through a bind-mounted resolv.conf: gVisor cannot reach Docker's
        // embedded resolver at `127.0.0.11`, and on a user bridge Docker
        // keeps that address in resolv.conf whatever `--dns` says, so the
        // file itself must name a reachable resolver. An operator who set
        // `CELLD_CONTAINER_DNS` gets it for every container.
        let wants_resolver = runtime.is_some() || !self.dns.is_empty();
        if wants_resolver {
            if let Some(resolv) = &self.resolv_conf {
                let bind = format!("{}:/etc/resolv.conf:ro", resolv.display());
                host_config["Binds"] = json!([bind]);
            }
        }
        // Every container has a limit: a class without an instance type
        // gets Cloudflare's default type rather than the node.
        let instance_type = cell
            .spec
            .instance_type
            .as_deref()
            .unwrap_or(DEFAULT_INSTANCE_TYPE);
        let (vcpu, memory) =
            instance_resources(instance_type).expect("the deploy refused this instance type");
        host_config["NanoCpus"] = json!((vcpu * 1e9) as u64);
        host_config["Memory"] = json!(memory);
        host_config["MemorySwap"] = json!(memory);
        let mut body = json!({
            "Image": cell.spec.image,
            "Env": env,
            "Labels": labels,
            "HostConfig": host_config,
        });
        if let Some(entrypoint) = params.entrypoint {
            body["Cmd"] = json!(entrypoint);
        }
        // The daemon can answer 409 for a name whose previous container is
        // still being removed, so a fresh start after `destroy()` retries
        // briefly, as workerd's engine does.
        let mut reply = self
            .docker
            .call(
                "POST",
                &format!("/containers/create?name={}", cell.name),
                Some(body.clone()),
            )
            .await?;
        for _ in 0..20 {
            if reply.status.as_u16() != 409 {
                break;
            }
            asyncrt::sleep(Duration::from_millis(100)).await;
            let _ = self
                .docker
                .call(
                    "DELETE",
                    &format!("/containers/{}?force=true", cell.name),
                    None,
                )
                .await;
            reply = self
                .docker
                .call(
                    "POST",
                    &format!("/containers/create?name={}", cell.name),
                    Some(body.clone()),
                )
                .await?;
        }
        if reply.status.as_u16() == 404 {
            return Err(anyhow!("No such image available named {}", cell.spec.image));
        }
        if !reply.status.is_success() {
            return Err(anyhow!(
                "Create container failed with [{}] {}",
                reply.status.as_u16(),
                reply.message()
            ));
        }
        self.docker
            .expect(
                "POST",
                &format!("/containers/{}/start", cell.name),
                None,
                "start container",
            )
            .await?;
        let info = self
            .docker
            .expect(
                "GET",
                &format!("/containers/{}/json", cell.name),
                None,
                "inspect container",
            )
            .await?
            .json()?;
        Ok(address_of(&info))
    }

    /// Wait for the current run to end. `Ok(code)` is the root process's
    /// exit code; a destroyed container reports 137.
    pub async fn monitor(&self, cell: &Arc<CellContainer>, run: u64) -> Result<i64, String> {
        let mut receiver = cell.exit.subscribe();
        loop {
            if let Some((ended, result)) = receiver.borrow_and_update().clone() {
                if ended >= run {
                    return result;
                }
            }
            if receiver.changed().await.is_err() {
                return Err("the container engine went away".to_string());
            }
        }
    }

    pub async fn destroy(&self, cell: &Arc<CellContainer>) -> anyhow::Result<()> {
        // Kill first so the wait task reports 137 before the removal makes
        // the name disappear under it.
        let _ = self
            .docker
            .call(
                "POST",
                &format!("/containers/{}/kill?signal=SIGKILL", cell.name),
                None,
            )
            .await;
        let _ = self
            .docker
            .call(
                "DELETE",
                &format!("/containers/{}?force=true", cell.name),
                None,
            )
            .await;
        let mut state = cell.state.lock().unwrap();
        state.running = false;
        state.address = Address::None;
        Ok(())
    }

    pub async fn signal(&self, cell: &Arc<CellContainer>, signal: u32) -> anyhow::Result<()> {
        self.docker
            .expect(
                "POST",
                &format!("/containers/{}/kill?signal={signal}", cell.name),
                None,
                "signal container",
            )
            .await?;
        Ok(())
    }

    /// The cell left this node's runtime. An idle eviction keeps the
    /// container for its inactivity window; anything else destroys it, and
    /// the stop waits for that: a drain ends the process right after its
    /// last stop, and a destroy left to a detached task did not always get
    /// its two daemon calls in before the exit.
    pub async fn release(self: &Arc<Self>, scope: &str, release: Release) {
        let Some(cell) = self.cell(scope) else {
            return;
        };
        match release {
            Release::Keep => {
                let window = cell
                    .state
                    .lock()
                    .unwrap()
                    .inactivity
                    .unwrap_or(DEFAULT_INACTIVITY);
                let engine = self.clone();
                let cell_ = cell.clone();
                let sweeper = asyncrt::spawn(async move {
                    asyncrt::sleep(window).await;
                    engine.forget(&cell_).await;
                });
                cell.state.lock().unwrap().sweeper = Some(sweeper);
            }
            Release::Destroy => self.forget(&cell).await,
        }
    }

    async fn forget(&self, cell: &Arc<CellContainer>) {
        let _ = self.destroy(cell).await;
        for id in cell.processes.lock().unwrap().drain(..) {
            drop_process(id);
        }
        let mut cells = self.cells.lock().unwrap();
        if cells
            .get(&cell.scope)
            .is_some_and(|current| Arc::ptr_eq(current, cell))
        {
            cells.remove(&cell.scope);
        }
    }

    pub async fn exec(
        &self,
        cell: &Arc<CellContainer>,
        params: ExecParams,
    ) -> anyhow::Result<Arc<ExecProcess>> {
        if !cell.running() {
            return Err(anyhow!("exec() requires a running container."));
        }
        let mut body = json!({
            "AttachStdin": true,
            "AttachStdout": true,
            "AttachStderr": true,
            "Tty": false,
            "Cmd": params.cmd,
        });
        if !params.env.is_empty() {
            body["Env"] = json!(params
                .env
                .iter()
                .map(|(name, value)| format!("{name}={value}"))
                .collect::<Vec<_>>());
        }
        if let Some(cwd) = &params.cwd {
            body["WorkingDir"] = json!(cwd);
        }
        if let Some(user) = &params.user {
            body["User"] = json!(user);
        }
        let created = self
            .docker
            .expect(
                "POST",
                &format!("/containers/{}/exec", cell.name),
                Some(body),
                "create exec",
            )
            .await?
            .json()?;
        let exec_id = created
            .get("Id")
            .and_then(Value::as_str)
            .ok_or_else(|| anyhow!("exec create answered without an id"))?
            .to_string();
        let stream = self
            .docker
            .hijack(
                &format!("/exec/{exec_id}/start"),
                json!({ "Detach": false, "Tty": false }),
            )
            .await?;
        // Docker reports `Running: false` with no pid before it has spawned
        // the process, and a finished exec keeps its pid, so a pid of zero
        // is the one answer that means "not yet": retry it briefly, as
        // workerd does. Breaking on `Running: false` here lost the pid of a
        // short command whenever the inspect landed in that window.
        let mut pid = 0;
        for _ in 0..20 {
            let info = self
                .docker
                .expect(
                    "GET",
                    &format!("/exec/{exec_id}/json"),
                    None,
                    "inspect exec",
                )
                .await?
                .json()?;
            pid = info.get("Pid").and_then(Value::as_i64).unwrap_or(0);
            if pid != 0 {
                break;
            }
            asyncrt::sleep(Duration::from_millis(50)).await;
        }
        let (read, write) = tokio::io::split(stream);
        let (stdout_tx, stdout_rx) = mpsc::channel(16);
        let (stderr_tx, stderr_rx) = mpsc::channel(16);
        let combined = params.combined;
        let ended = watch::channel(false).0;
        let ended_ = ended.clone();
        asyncrt::spawn(async move {
            demux(read, stdout_tx, stderr_tx, combined).await;
            ended_.send_replace(true);
        })
        .detach();
        let process = Arc::new(ExecProcess {
            id: next_exec_id(),
            exec_id,
            container: cell.name.clone(),
            pid,
            docker: self.docker.clone(),
            stdin: tokio::sync::Mutex::new(Some(write)),
            stdout: tokio::sync::Mutex::new(stdout_rx),
            stderr: tokio::sync::Mutex::new(stderr_rx),
            ended,
            exit_code: tokio::sync::Mutex::new(None),
        });
        processes()
            .lock()
            .unwrap()
            .insert(process.id, process.clone());
        cell.processes.lock().unwrap().push(process.id);
        Ok(process)
    }
}

pub struct ExecParams {
    pub cmd: Vec<String>,
    pub env: Vec<(String, String)>,
    pub cwd: Option<String>,
    pub user: Option<String>,
    /// stderr folded into stdout.
    pub combined: bool,
}

type WriteHalf = tokio::io::WriteHalf<Box<dyn Stream>>;

pub struct ExecProcess {
    pub id: u64,
    exec_id: String,
    container: String,
    pub pid: i64,
    docker: Docker,
    stdin: tokio::sync::Mutex<Option<WriteHalf>>,
    stdout: tokio::sync::Mutex<mpsc::Receiver<Bytes>>,
    stderr: tokio::sync::Mutex<mpsc::Receiver<Bytes>>,
    /// True once the hijacked stream reached EOF, which the daemon sends
    /// when the process exits.
    ended: watch::Sender<bool>,
    exit_code: tokio::sync::Mutex<Option<i64>>,
}

fn processes() -> &'static Mutex<HashMap<u64, Arc<ExecProcess>>> {
    static PROCESSES: OnceLock<Mutex<HashMap<u64, Arc<ExecProcess>>>> = OnceLock::new();
    PROCESSES.get_or_init(Default::default)
}

fn next_exec_id() -> u64 {
    static NEXT: AtomicU64 = AtomicU64::new(1);
    NEXT.fetch_add(1, Ordering::Relaxed)
}

pub fn process(id: u64) -> Option<Arc<ExecProcess>> {
    processes().lock().unwrap().get(&id).cloned()
}

pub fn drop_process(id: u64) {
    processes().lock().unwrap().remove(&id);
}

impl ExecProcess {
    /// One chunk of stdout (`1`) or stderr (`2`); empty at end of stream.
    pub async fn read(&self, which: u8) -> Bytes {
        let mut receiver = match which {
            1 => self.stdout.lock().await,
            _ => self.stderr.lock().await,
        };
        receiver.recv().await.unwrap_or_default()
    }

    pub async fn write(&self, bytes: &[u8]) -> Result<(), String> {
        let mut guard = self.stdin.lock().await;
        let stdin = guard.as_mut().ok_or("stdin is closed")?;
        stdin
            .write_all(bytes)
            .await
            .map_err(|error| format!("stdin write failed: {error}"))?;
        stdin
            .flush()
            .await
            .map_err(|error| format!("stdin flush failed: {error}"))
    }

    /// End stdin. Half-closing the hijacked connection is how the daemon
    /// learns the process's stdin reached EOF.
    pub async fn close_stdin(&self) {
        if let Some(mut stdin) = self.stdin.lock().await.take() {
            let _ = stdin.shutdown().await;
        }
    }

    pub async fn wait(&self) -> anyhow::Result<i64> {
        let mut exit = self.exit_code.lock().await;
        if let Some(code) = *exit {
            return Ok(code);
        }
        let mut ended = self.ended.subscribe();
        while !*ended.borrow_and_update() {
            if ended.changed().await.is_err() {
                break;
            }
        }
        // The stream closes when the process exits, but the daemon records
        // the exit code a moment later.
        let mut code = None;
        for _ in 0..40 {
            let info = self
                .docker
                .expect(
                    "GET",
                    &format!("/exec/{}/json", self.exec_id),
                    None,
                    "inspect exec",
                )
                .await?
                .json()?;
            if !info
                .get("Running")
                .and_then(Value::as_bool)
                .unwrap_or(false)
            {
                code = info.get("ExitCode").and_then(Value::as_i64);
                break;
            }
            asyncrt::sleep(Duration::from_millis(50)).await;
        }
        let code = code.ok_or_else(|| anyhow!("the process did not report an exit code"))?;
        *exit = Some(code);
        Ok(code)
    }

    /// The Engine API has no exec kill, so the signal is delivered by a
    /// second exec of `kill`, as workerd does.
    pub async fn kill(&self, signal: u32) -> anyhow::Result<()> {
        let body = json!({
            "AttachStdin": false, "AttachStdout": false, "AttachStderr": false,
            "Cmd": ["kill", format!("-{signal}"), self.pid.to_string()],
        });
        let created = self
            .docker
            .expect(
                "POST",
                &format!("/containers/{}/exec", self.container),
                Some(body),
                "create exec",
            )
            .await?
            .json()?;
        let id = created
            .get("Id")
            .and_then(Value::as_str)
            .ok_or_else(|| anyhow!("exec create answered without an id"))?;
        self.docker
            .expect(
                "POST",
                &format!("/exec/{id}/start"),
                Some(json!({ "Detach": true })),
                "start exec",
            )
            .await?;
        Ok(())
    }
}

/// Split Docker's multiplexed stream into stdout and stderr chunks until
/// the daemon closes it.
async fn demux(
    mut read: tokio::io::ReadHalf<Box<dyn Stream>>,
    stdout: mpsc::Sender<Bytes>,
    stderr: mpsc::Sender<Bytes>,
    combined: bool,
) {
    let mut header = [0u8; 8];
    loop {
        if read.read_exact(&mut header).await.is_err() {
            return;
        }
        let (stream, length) = frame_header(&header);
        let mut payload = vec![0u8; length];
        if read.read_exact(&mut payload).await.is_err() {
            return;
        }
        let target = if stream == 2 && !combined {
            &stderr
        } else {
            &stdout
        };
        if target.send(Bytes::from(payload)).await.is_err() {
            // The reader went away; keep draining so the process is not
            // blocked on a full pipe.
            continue;
        }
    }
}

fn address_of(info: &Value) -> Address {
    if cfg!(target_os = "linux") {
        let ip = info
            .pointer("/NetworkSettings/Networks")
            .and_then(Value::as_object)
            .and_then(|networks| networks.values().next())
            .and_then(|network| network.get("IPAddress"))
            .and_then(Value::as_str)
            .filter(|ip| !ip.is_empty());
        return ip.map_or(Address::None, |ip| Address::Ip(ip.to_string()));
    }
    let mut ports = HashMap::new();
    if let Some(map) = info
        .pointer("/NetworkSettings/Ports")
        .and_then(Value::as_object)
    {
        for (key, bindings) in map {
            let Some(port) = key
                .strip_suffix("/tcp")
                .and_then(|port| port.parse::<u16>().ok())
            else {
                continue;
            };
            let host = bindings
                .as_array()
                .into_iter()
                .flatten()
                .find_map(|binding| binding.get("HostPort")?.as_str()?.parse::<u16>().ok());
            if let Some(host) = host {
                ports.insert(port, host);
            }
        }
    }
    Address::Published(ports)
}

/// A Docker name from a node and a cell scope: the scope's characters are
/// not all legal, so the name is a hash and the scope rides in a label.
/// The node is part of it because two nodes can share one engine in a
/// development or test setup, and a name from the scope alone let one
/// node adopt, or reap, the other's container for the same object.
fn container_name(node: &str, scope: &str) -> String {
    use sha2::Digest;
    let digest = sha2::Sha256::digest(format!("{node}\n{scope}").as_bytes());
    format!("celld-{:x}", digest)[..30].to_string()
}

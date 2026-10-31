// Copyright 2026 Deno Land Inc. Apache-2.0 license.

//! Reaching a reserved-class cell from outside the fleet.
//!
//! The operator commands have to find a live node, sign a request with
//! the fleet secret, and post it to `/runtime/<scope>`, which forwards to the
//! cell's owner. Neither can open the object in the bucket instead: that writes
//! behind the fence, and the owner's next flush overwrites it. Neither can name
//! one node either, because an operator's internal listener has an ephemeral
//! port by default. Both constraints are `d1.md` decision 4's, and neither
//! becomes less true for the second command that meets them.
//!
//! So this is that machinery, once. It was `d1_cli`'s, and it was already
//! generic in everything but the noun in its messages and the label it signs
//! with -- which is the shape that gets copied rather than shared. What stays
//! in `d1_cli` is what is actually about SQL: `exec`, `query`, and the
//! migration ledger, which extend `Reachable` from there.

use std::time::Duration;

use anyhow::{anyhow, bail, Context};
use serde_json::Value;

use crate::bucket::Bucket;

/// What a command is reaching, for the operator reading the error.
pub(crate) struct Subject {
    /// The resource as an operator names it: "database", "namespace".
    pub(crate) noun: &'static str,
    /// The `peer_auth` source label, which is what appears in a node's log.
    pub(crate) source: &'static str,
    /// How long one call may take. A migration on a large table is not a
    /// diagnostic ping, so this is the handler budget's order and not the
    /// probe's.
    pub(crate) timeout: Duration,
}

/// Where the fleet is, and how much the caller trusts what it advertises.
pub(crate) struct Fleet<'a> {
    pub(crate) bucket: &'a str,
    pub(crate) endpoint: Option<&'a str>,
    pub(crate) region: &'a str,
    pub(crate) unsafe_public_advertise: bool,
}

pub(crate) struct Entrance {
    node: String,
    url: String,
    path: String,
}

/// A database resolved to the nodes that can carry SQL to it.
pub(crate) struct Reachable {
    http: reqwest::Client,
    /// The fleet's shared peer secret, read from the bucket. `/runtime/` refuses
    /// an unsigned request, because a D1 database holds application data and
    /// answers arbitrary SQL.
    auth: crate::peer_auth::PeerAuth,
    /// Every node with a live lease. Any one of them forwards to the owner, so
    /// the list is a set of equal entrances and not a route: it stays correct
    /// even when the cell moves between calls.
    entrances: Vec<Entrance>,
    subject: Subject,
}

impl Reachable {
    pub(crate) async fn open(
        fleet: Fleet<'_>,
        subject: Subject,
        scope: String,
        name: Option<&str>,
    ) -> anyhow::Result<Self> {
        let bucket = crate::fleet::bucket_client(fleet.bucket, fleet.endpoint, fleet.region)?;
        let nodes = live_nodes(&bucket, fleet.unsafe_public_advertise, subject.source).await?;
        // The same secret and the same source shape `celld diagnose` uses.
        let auth = crate::peer_auth::PeerAuth::new(
            crate::peer_auth::load_existing(&bucket).await?,
            subject.source,
        )?;
        let http = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            // A migration on a large table is not a diagnostic ping, so this
            // budget is the handler budget's order rather than the probe's.
            .timeout(subject.timeout)
            .build()
            .with_context(|| format!("build the {} client", subject.noun))?;
        let mut path = format!("/runtime/{scope}");
        if let Some(name) = name {
            // An operator command can be the first request to construct a
            // reserved cell. A later named binding call cannot repair the
            // identity that the existing JavaScript instance already cached.
            path.push('?');
            path.push_str(
                &url::form_urlencoded::Serializer::new(String::new())
                    .append_pair("name", name)
                    .finish(),
            );
        }
        Ok(Self {
            http,
            auth,
            subject,
            entrances: nodes
                .into_iter()
                .map(|(node, addr)| Entrance {
                    node,
                    url: format!("http://{addr}{path}"),
                    path: path.clone(),
                })
                .collect(),
        })
    }

    /// A lease outlives the node that wrote it, and a node that drains keeps
    /// its lease while it refuses work, so the first entrance in the list is
    /// not always usable. Move to the next one when a node cannot be reached
    /// or is draining, because in both cases the request provably did not run.
    /// Nothing else is retried: a timeout is not evidence that the work was
    /// refused, and re-sending a migration that in fact ran would apply it
    /// twice.
    pub(crate) async fn call(&self, body: Value) -> anyhow::Result<Value> {
        // Signed per entrance, because the signature binds the node it is
        // addressed to: a signature for one node is not replayable at another.
        let payload = serde_json::to_vec(&body).context("encode the request")?;
        let mut refused = Vec::new();
        for (index, entrance) in self.entrances.iter().enumerate() {
            let last = index + 1 == self.entrances.len();
            let url = &entrance.url;
            let request = self
                .auth
                .sign(
                    self.http.post(url).body(payload.clone()),
                    "POST",
                    &entrance.path,
                    &payload,
                    &entrance.node,
                )
                .with_context(|| format!("sign the request to {}", entrance.node))?;
            let response = match request.send().await {
                Ok(response) => response,
                Err(error) if error.is_connect() && !last => {
                    refused.push(format!("{url}: {error}"));
                    continue;
                }
                Err(error) => {
                    return Err(anyhow::Error::new(error)).with_context(|| {
                        format!(
                            "reach the {} at {url}{}",
                            self.subject.noun,
                            report(&refused)
                        )
                    });
                }
            };
            let status = response.status();
            let text = response.text().await.context("read the reply")?;
            if status == reqwest::StatusCode::SERVICE_UNAVAILABLE
                && text.contains("\"draining\"")
                && !last
            {
                refused.push(format!("{url}: the node is draining"));
                continue;
            }
            // The dispatcher refusing at the door is the doc comment's
            // criterion exactly: the request provably did not run, so the
            // next entrance is safe to try where a timeout would not be.
            if status == reqwest::StatusCode::SERVICE_UNAVAILABLE
                && text.contains("dispatcher unavailable")
                && !last
            {
                refused.push(format!("{url}: the node's dispatcher is unavailable"));
                continue;
            }
            let value: Value = serde_json::from_str(&text)
                .with_context(|| format!("decode the reply ({status}): {text}"))?;
            if let Some(error) = value.get("error").and_then(Value::as_str) {
                bail!("{error}{}", report(&refused));
            }
            if !status.is_success() {
                bail!(
                    "the {} refused the request ({status}): {text}{}",
                    self.subject.noun,
                    report(&refused)
                );
            }
            return value
                .get("result")
                .cloned()
                .ok_or_else(|| anyhow!("the reply carried no result: {text}{}", report(&refused)));
        }
        bail!("no node in the fleet answered{}", report(&refused))
    }
}

async fn live_nodes(
    bucket: &Bucket,
    unsafe_public_advertise: bool,
    source: &str,
) -> anyhow::Result<Vec<(String, String)>> {
    let nodes = crate::fleet::node_lease_ids(bucket).await?;
    if nodes.is_empty() {
        bail!("no node leases in the bucket; celld {source} needs a running fleet");
    }
    let mut reachable = Vec::new();
    let mut refused = Vec::new();
    for node in &nodes {
        let lease = match crate::fleet::live_node_lease(bucket, node).await {
            Ok(Some(lease)) => lease,
            Ok(None) => continue,
            Err(error) => {
                refused.push(format!("{node}: {error}"));
                continue;
            }
        };
        let advertise = match crate::startup::parse_advertise(&lease.addr) {
            Ok(advertise) => advertise,
            Err(error) => {
                refused.push(format!(
                    "{node}: malformed address {:?}: {error}",
                    lease.addr
                ));
                continue;
            }
        };
        if advertise.is_public_ip() && !unsafe_public_advertise {
            refused.push(format!(
                "{node}: public advertise address {}; use a private overlay or \
                 --unsafe-public-advertise",
                lease.addr
            ));
            continue;
        }
        reachable.push((node.clone(), lease.addr.clone()));
    }
    if reachable.is_empty() {
        bail!(
            "no node in the fleet is reachable; every lease is expired or refused{}",
            report(&refused)
        );
    }
    Ok(reachable)
}

/// Indented detail under a refusal, or nothing when there is none to give.
pub(crate) fn report(refused: &[String]) -> String {
    if refused.is_empty() {
        String::new()
    } else {
        format!("\n  {}", refused.join("\n  "))
    }
}

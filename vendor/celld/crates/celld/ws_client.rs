// Copyright 2026 Deno Land Inc. Apache-2.0 license.

// The real peer WebSocket transport is outside the Actor execution domain.
#![allow(clippy::disallowed_methods)]

//! Outbound WebSocket client.
//!
//! celld serves WebSockets with fastwebsockets, and connects with it too. That
//! matters most on the peer hop: a frame relayed from a client to the cell's
//! owner is framed, masked, and closed by one implementation on both sides
//! rather than translated between two.
//!
//! What this owns that a client library would have owned: the TLS setup, the
//! handshake headers, and the non-101 response. The last one is why
//! `fastwebsockets::handshake::client` is not called directly -- it discards
//! the response body, and `new WebSocket()` reports a declined upgrade with it.

use anyhow::anyhow;
use anyhow::Context;
use base64::Engine;
use fastwebsockets::Role;
use fastwebsockets::WebSocket;
use http_body_util::BodyExt;
use http_body_util::Empty;
use hyper::header::HeaderMap;
use hyper::header::HeaderValue;
use hyper::header::CONNECTION;
use hyper::header::HOST;
use hyper::header::SEC_WEBSOCKET_ACCEPT;
use hyper::header::SEC_WEBSOCKET_KEY;
use hyper::header::SEC_WEBSOCKET_VERSION;
use hyper::header::UPGRADE;
use hyper::upgrade::Upgraded;
use hyper::Request;
use hyper::StatusCode;
use hyper_util::rt::TokioIo;
use sha1::Digest;
use sha1::Sha1;
use std::sync::OnceLock;
use tokio::io::AsyncRead;
use tokio::io::AsyncWrite;

/// A server response that was not a 101.
pub struct Declined {
    pub status: StatusCode,
    pub headers: HeaderMap,
    pub body: Vec<u8>,
}

pub enum Error {
    /// The server answered and refused the upgrade. Callers read this: a 401
    /// revokes managed credentials, a stale-route header triggers a
    /// redispatch, and the isolate surfaces the whole thing to `onerror`.
    Declined(Declined),
    /// No answer to read -- DNS, TCP, TLS, or a malformed handshake.
    Failed(anyhow::Error),
}

impl From<anyhow::Error> for Error {
    fn from(error: anyhow::Error) -> Self {
        Error::Failed(error)
    }
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::Declined(declined) => {
                write!(f, "server refused the upgrade: {}", declined.status)
            }
            Error::Failed(error) => write!(f, "{error}"),
        }
    }
}

pub struct Connection {
    pub socket: WebSocket<TokioIo<Upgraded>>,
    /// The 101's headers: the negotiated subprotocol, and on the peer hop the
    /// signature the caller verifies before trusting the tunnel.
    pub headers: HeaderMap,
}

/// Mozilla's roots, the same set the previous client compiled in. Deliberately
/// not the platform store: a downloaded celld should reach `wss://` on a host
/// that has no `/etc/ssl/certs`.
fn tls_config() -> &'static tokio_rustls::TlsConnector {
    static CONFIG: OnceLock<tokio_rustls::TlsConnector> = OnceLock::new();
    CONFIG.get_or_init(|| {
        let roots = rustls::RootCertStore {
            roots: webpki_roots::TLS_SERVER_ROOTS.to_vec(),
        };
        let config = rustls::ClientConfig::builder()
            .with_root_certificates(roots)
            .with_no_client_auth();
        tokio_rustls::TlsConnector::from(std::sync::Arc::new(config))
    })
}

/// RFC 6455's proof the server read the key rather than blindly answering 101.
fn accept_key(key: &str) -> String {
    let mut digest = Sha1::new();
    digest.update(key.as_bytes());
    digest.update(b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11");
    base64::engine::general_purpose::STANDARD.encode(digest.finalize())
}

/// Open a WebSocket to `url`, sending `extra` alongside the handshake headers.
///
/// The caller owns the timeout: nothing here bounds how long a server may take
/// to answer.
pub async fn connect(url: &str, extra: HeaderMap) -> Result<Connection, Error> {
    let url = url::Url::parse(url).context("parse WebSocket URL")?;
    let tls = match url.scheme() {
        "ws" => false,
        "wss" => true,
        scheme => return Err(anyhow!("not a WebSocket scheme: {scheme}").into()),
    };
    let host = url
        .host_str()
        .context("WebSocket URL has no host")?
        .to_string();
    let port = url.port_or_known_default().context("no port")?;
    let authority = match (tls, port) {
        (false, 80) | (true, 443) => host.clone(),
        _ => format!("{host}:{port}"),
    };
    let target = match url.query() {
        Some(query) => format!("{}?{query}", url.path()),
        None => url.path().to_string(),
    };

    let tcp = tokio::net::TcpStream::connect((host.as_str(), port))
        .await
        .with_context(|| format!("connect {authority}"))?;
    let stream: Box<dyn Stream> = if tls {
        let name = rustls::pki_types::ServerName::try_from(host.clone())
            .map_err(|_| anyhow!("invalid TLS server name: {host}"))?;
        Box::new(
            tls_config()
                .connect(name, tcp)
                .await
                .with_context(|| format!("TLS handshake with {authority}"))?,
        )
    } else {
        Box::new(tcp)
    };

    let key = fastwebsockets::handshake::generate_key();
    let mut request = Request::builder()
        .method("GET")
        .uri(&target)
        .header(HOST, &authority)
        .header(UPGRADE, "websocket")
        .header(CONNECTION, "Upgrade")
        .header(SEC_WEBSOCKET_KEY, &key)
        .header(SEC_WEBSOCKET_VERSION, "13")
        .body(Empty::<bytes::Bytes>::new())
        .context("build WebSocket handshake")?;
    request.headers_mut().extend(extra);

    let (mut sender, connection) = hyper::client::conn::http1::handshake(TokioIo::new(stream))
        .await
        .with_context(|| format!("HTTP handshake with {authority}"))?;
    // The upgrade is completed by polling this, so it has to outlive the
    // response -- and keep running afterwards to drive the upgraded stream.
    tokio::spawn(async move {
        let _ = connection.with_upgrades().await;
    });

    let mut response = sender
        .send_request(request)
        .await
        .with_context(|| format!("WebSocket handshake with {authority}"))?;
    if response.status() != StatusCode::SWITCHING_PROTOCOLS {
        let status = response.status();
        let headers = response.headers().clone();
        let body = response
            .into_body()
            .collect()
            .await
            .map(|body| body.to_bytes().to_vec())
            .unwrap_or_default();
        return Err(Error::Declined(Declined {
            status,
            headers,
            body,
        }));
    }
    if response
        .headers()
        .get(SEC_WEBSOCKET_ACCEPT)
        .map(HeaderValue::as_bytes)
        != Some(accept_key(&key).as_bytes())
    {
        return Err(anyhow!("server returned an invalid Sec-WebSocket-Accept").into());
    }

    let headers = response.headers().clone();
    let upgraded = hyper::upgrade::on(&mut response)
        .await
        .with_context(|| format!("upgrade the connection to {authority}"))?;
    Ok(Connection {
        socket: WebSocket::after_handshake(TokioIo::new(upgraded), Role::Client),
        headers,
    })
}

trait Stream: AsyncRead + AsyncWrite + Send + Unpin {}
impl<S: AsyncRead + AsyncWrite + Send + Unpin> Stream for S {}

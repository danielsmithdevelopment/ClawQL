# syntax=docker/dockerfile:1.7

ARG RUST_VERSION=1.97.1
ARG CELLD_COMMIT=unknown

FROM rust:${RUST_VERSION}-bookworm AS build
ARG TARGETARCH
# `release` for shipped artifacts; a fast-loop caller passes `lab` to skip
# the fat-LTO relink and keep incremental state in the target cache.
ARG CELLD_PROFILE=release
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
RUN --mount=type=cache,id=celld-cargo-registry,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,id=celld-cargo-git,target=/usr/local/cargo/git,sharing=locked \
    --mount=type=cache,id=celld-target-${TARGETARCH},target=/src/target,sharing=locked \
    mkdir -p /out && \
    cargo build --profile "${CELLD_PROFILE}" --locked -p celld && \
    install -m 755 "target/${CELLD_PROFILE}/celld" /out/celld

# The final image depends on this stage, so a break in the engine's tests or
# lints stops the build.
FROM build AS test
ARG TARGETARCH
RUN rustup component add clippy
# The ltx fault-injection oracle diffs databases with the sqlite3 CLI.
RUN apt-get update && \
    apt-get install -y --no-install-recommends sqlite3 && \
    rm -rf /var/lib/apt/lists/*
RUN --mount=type=cache,id=celld-cargo-registry,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,id=celld-cargo-git,target=/usr/local/cargo/git,sharing=locked \
    --mount=type=cache,id=celld-target-${TARGETARCH},target=/src/target,sharing=locked \
    cargo test --profile "${CELLD_PROFILE}" --locked && \
    cargo clippy --profile "${CELLD_PROFILE}" --all-targets --locked -- -D warnings

FROM debian:bookworm-slim
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*
ARG CELLD_COMMIT
ARG CELLD_VERSION=unknown
LABEL org.opencontainers.image.title="celld" \
      org.opencontainers.image.revision="${CELLD_COMMIT}" \
      org.opencontainers.image.version="${CELLD_VERSION}"
COPY --from=test /out/celld /usr/local/bin/celld
ENTRYPOINT ["/usr/local/bin/celld"]

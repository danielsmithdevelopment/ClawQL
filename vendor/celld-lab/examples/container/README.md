# Container

A Durable Object that supervises a container. The object extends the
`Container` class from `@cloudflare/containers`, and the image is the
`Dockerfile` beside it: a small Python HTTP server on port 8080.

Install the dependency, then run the example. `celld dev` builds the image
with the Docker or Podman CLI on your `PATH` and starts the container the
first time a request reaches the object:

```sh
npm install
celld dev
curl http://127.0.0.1:9876/container/alpha
curl http://127.0.0.1:9876/container/beta
curl http://127.0.0.1:9876/lb
```

Each path under `/container/` is one object, and each object runs one
container. The response carries the container's hostname, so two paths show
two containers. `/lb` spreads requests over three containers.

Deploy to a fleet from this directory. `celld deploy` saves the image to the
bucket, and each node loads it the first time a cell of the class starts:

```sh
celld deploy . --bucket s3://my-cells-bucket
```

Every node that serves the class needs a container engine: a Docker or
Podman daemon on its default socket, or the socket named by `DOCKER_HOST`.

The class declares `instance_type: "basic"`, a quarter of a CPU and 1 GiB.
Without a type a container gets Cloudflare's `dev` type, a sixteenth of a
CPU, and this server takes about four seconds to start on it instead of
under one.

# Sandbox

The Cloudflare Sandbox SDK on celld: each sandbox is a Durable Object that
supervises a container built from the `cloudflare/sandbox` image, and the
`@cloudflare/sandbox` package drives it from the Worker. Commands, files,
and background processes run inside the container.

Install the dependency, then run the example. The first request pulls the
base image, which is about 225 MB, so it takes a while:

```sh
npm install
celld dev
curl 'http://127.0.0.1:9876/exec?cmd=uname+-a'
curl 'http://127.0.0.1:9876/write'
curl 'http://127.0.0.1:9876/serve'
curl 'http://127.0.0.1:9876/processes'
curl 'http://127.0.0.1:9876/exec?id=other&cmd=ls+/workspace'
```

Each `id` is one sandbox with its own filesystem, so the second `ls` shows
an empty workspace. Deploy to a fleet from this directory:

```sh
celld deploy . --bucket s3://my-cells-bucket
```

`celld deploy` saves the image to the bucket once, and each node loads it
the first time one of its sandboxes starts. Preview URLs, tunnels, and
bucket mounts are features of the package and of the container; see the
[Containers documentation](../../docs/services/containers.md)
notes for what celld does not provide.

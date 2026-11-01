# Dynamic Worker tails

This example loads a Worker from a source string. The loaded Worker returns a
response and writes one console record.

`DynamicWorkerTail` receives the invocation event after the response is
available. It copies the captured record into the loader Worker's logs and adds
the `workerId` prop.

Run the example and enable log output:

```sh
celld dev . --logs
```

Send a request from another terminal:

```sh
curl http://127.0.0.1:8787
```

The request returns `Hello from a Dynamic Worker!`. The celld output contains
`dynamic-worker-tail: hello from loaded code`.

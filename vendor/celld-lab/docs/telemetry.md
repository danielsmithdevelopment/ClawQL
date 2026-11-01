# Telemetry

celld can record traces and logs for the requests it serves. Telemetry is off
by default and costs nothing when off. `CELLD_OTEL=1` writes Parquet files
under the `telemetry/` prefix of the fleet bucket, which DuckDB can query
directly. `CELLD_OTEL=http://collector:4318` sends the same data to an
OpenTelemetry collector.

The schema is version `v0-unstable`, so column names can change before a
stable release. Each file carries the version in the object metadata name
`celld-schema`, or `celld_schema` on an `az://` bucket.

## Configuration

| variable | default | effect |
| --- | --- | --- |
| `CELLD_OTEL` | `0` | `0` disables telemetry. `1` writes Parquet to the fleet bucket. An HTTP(S) collector base URL selects OTLP/HTTP protobuf. |
| `CELLD_OTEL_BUCKET` | the fleet bucket | A different bucket for the Parquet files, on the same endpoint and credentials. |
| `CELLD_OTEL_RETENTION` | `30d` | celld deletes telemetry files older than this. `none` disables the deletion, so your own lifecycle rules can control the data. In the fleet bucket, such a rule must select only the `telemetry/` prefix, after the key prefix if the bucket value has one. [Guarantees](guarantees.md) lists the reserved prefixes that a rule must not select. |
| `CELLD_OTEL_FLUSH_MS` | `300000` | celld writes a Parquet file after this many milliseconds of buffered events. |
| `CELLD_OTEL_FLUSH_BYTES` | `5242880` | The estimated buffered bytes that trigger a flush before the interval ends. |
| `OTEL_TRACES_SAMPLER` | `parentbased_always_on` | A standard sampler name. `traceidratio` with `OTEL_TRACES_SAMPLER_ARG` records a fraction of the traces. |
| `OTEL_EXPORTER_OTLP_HEADERS` | unset | A comma-separated list of `name=value` headers for the collector. |
| `OTEL_EXPORTER_OTLP_TIMEOUT` | `10000` | The collector request timeout in milliseconds. |
| `OTEL_SERVICE_NAME` | `celld` | The service name in the exported resource. |

The bucket sink requires `CELLD_BUCKET`. The OTLP sink does not.

A collector URL must have no query or fragment. celld appends `/v1/traces` and
`/v1/logs` to its path and ignores `OTEL_EXPORTER_OTLP_ENDPOINT`.

`CELLD_OTEL_SINK` is removed, and a node with it set does not start. Put the
collector base URL in `CELLD_OTEL`, or keep `CELLD_OTEL=1` for the bucket.

## What celld records

celld records a span for each stateless Worker request, each cell event (a
fetch, an alarm, an RPC, a WebSocket message), each outbound `fetch()`, and
each cell start. A span carries the request id, the cell, the isolate, the
queue wait, the outbound URL and status, and the known durability facts.

Each `console.log` line becomes a log record with the trace id and span id of
its handler, across `await`. The record carries the console method's severity
in `severity_number` and `severity_text` (OTLP fields and Parquet columns). The
body holds only the message.

| method | severity number | severity text |
| --- | --- | --- |
| `console.debug` | `5` | `DEBUG` |
| `console.log`, `console.info` | `9` | `INFO` |
| `console.warn` | `13` | `WARN` |
| `console.error` | `17` | `ERROR` |

Log files from earlier celld versions have no severity columns. Read a mix of
versions with `union_by_name = true`.

celld reads the W3C `traceparent` header on incoming requests and sends it on
outbound `fetch()`. A malformed header starts a new trace. A Worker call to a
Durable Object stays in one trace.

The sampler decides at the start of a request, and an unsampled request
records nothing. A ratio of `0` records no traces and `1` records all. An
intermediate ratio makes the same trace-id decision on each node. celld keeps
a valid incoming context that the sampler rejects: an outbound `fetch()` or
Durable Object call keeps the trace id, uses a new span id, and keeps the
sampled flag clear.

Under load, telemetry sheds before requests do, and celld counts what it
sheds. celld records no metrics yet.

## Query the bucket with DuckDB

```sql
INSTALL httpfs; LOAD httpfs;
CREATE SECRET celld_telemetry (
  TYPE s3, KEY_ID '...', SECRET '...',
  ENDPOINT 's3.example.com', URL_STYLE 'path'
);
CREATE VIEW traces AS SELECT * FROM
  read_parquet('s3://YOUR-BUCKET/telemetry/traces/*/*/*/*/*/*.parquet');
CREATE VIEW logs AS SELECT * FROM
  read_parquet('s3://YOUR-BUCKET/telemetry/logs/*/*/*/*/*/*.parquet');

-- The slowest requests.
SELECT name, duration_us, trace_id FROM traces
  ORDER BY duration_us DESC LIMIT 20;

-- The error lines.
SELECT time_unix_us, body FROM logs WHERE severity_number >= 17;

-- Every log line, inside the span that wrote it.
SELECT l.body, t.name, t.duration_us FROM logs l
  JOIN traces t ON l.trace_id = t.trace_id AND l.span_id = t.span_id;
```

A non-AWS S3-compatible endpoint needs `URL_STYLE 'path'`. A plain-HTTP
endpoint also needs `USE_SSL false`.

Files are partitioned by node and hour:
`telemetry/traces/<node>/<yyyy>/<mm>/<dd>/<hh>/<id>.parquet`.

## Flushing and delivery

celld writes one Parquet file per flush, at 5 minutes
(`CELLD_OTEL_FLUSH_MS=300000`) or 5 MiB of estimated buffered events
(`CELLD_OTEL_FLUSH_BYTES=5242880`), whichever comes first. The event that
reaches the target can take the batch past it.

Keep the defaults if you run no compaction job. They produce large files, but
data can arrive up to 5 minutes late. `CELLD_OTEL_FLUSH_MS=5000` gives a
five-second interval, plus upload or collector delay. A short interval makes
many small files and slows queries within hours, so start the compaction job
first. For a near-live view, use the OTLP sink with the same short interval.

The OTLP sink makes at most five attempts per batch on a transient failure
(HTTP 408, 429, 502, 503, or 504). It uses exponential backoff with jitter and
honors `Retry-After`, with each delay capped at 30 seconds. A permanent
refusal drops the batch.

The exporter holds one retrying batch, and the input channel holds 8192 new
events. When the channel is full, celld drops and counts new telemetry, so
request handling continues.

The retention sweep runs at startup and six hours after each completed sweep.

## Compaction

celld does not compact its own files. Run a compaction job on a maintenance
node once an hour, for the hour that just ended. Do not compact the current
hour, because a node still writes to it.

```sql
COPY (
  SELECT * FROM
    read_parquet('s3://YOUR-BUCKET/telemetry/traces/<node>/2026/08/09/22/*.parquet')
  ORDER BY start_unix_us
) TO 's3://YOUR-BUCKET/telemetry/traces/<node>/2026/08/09/22/compacted.parquet'
  (FORMAT parquet, COMPRESSION zstd);
```

Delete the source files after DuckDB writes the compacted file.

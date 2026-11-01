# Queues

[Queues](https://developers.cloudflare.com/queues/) is a message broker. A
producer Worker sends a message, and a consumer Worker receives it later in a
batch. Each queue is one celld cell. Read the
[Cloudflare Queues documentation](https://developers.cloudflare.com/queues/configuration/javascript-apis/)
for the API.

## Example

The [Queues example](../../examples/queues) sends one job from a request and
processes the job in a queue handler. A job for a path that ends in `/fail`
retries twice, and the example then reads it from a dead-letter queue.

<!-- celld-example: queues -->

## API

- `env.JOBS.send(body, { contentType, delaySeconds })` sends one message.
  `contentType` is `"v8"`, `"json"`, `"text"`, or `"bytes"`.
- `env.JOBS.sendBatch(messages)` sends up to 100 messages in one call.
- The consumer script exports `queue(batch, env, ctx)`. `batch.queue` names the
  queue, and each entry of `batch.messages` has an `id`, a `timestamp`, a
  `body`, and an `attempts` count.
- `message.ack()` and `message.retry({ delaySeconds })` settle one message.
  `batch.ackAll()` and `batch.retryAll()` settle the whole batch. The first
  call for a message wins.
- A handler that returns acknowledges every unsettled message. A handler that
  throws retries every message that it did not acknowledge.

## Producers

A `queues.producers` entry gives a `binding` and a `queue` name. Every producer
in the fleet that names one queue writes to the same queue. celld enforces the
[Cloudflare limits](https://developers.cloudflare.com/queues/platform/limits/):
a message of at most 128,000 bytes, at most 100 messages and 256,000 bytes in
one `sendBatch()` call, and a `delaySeconds` of at most 86,400. A producer entry
can set `delivery_delay` as the default delay.

`send()` resolves after the queue cell commits the message. The cell accepts at
most 256 producer calls at a time, and it refuses a further call with a cell
overload error that the producer can retry.

## Consumers

A `queues.consumers` entry names the `queue`. Only one script can consume a
queue, so a deployment in which two scripts consume one queue fails. The entry
sets `max_batch_size` (10 by default, 100 at most), `max_batch_timeout` in
seconds (5 by default, 60 at most), `max_retries` (3 by default),
`max_concurrency` (250 at most), `retry_delay`, and `dead_letter_queue`. celld
validates each bound at deploy time. Read
[Batching, retries, and delays](https://developers.cloudflare.com/queues/configuration/batching-retries/)
for the meaning of each key.

celld does not guarantee a delivery order, and it delivers a message at least
once. `message.id` stays the same across a redelivery, so an application can use
it as an idempotency key. A handler that never settles its batch holds the lease
until the lease expires, and celld counts that as one failed delivery. celld
adds no exponential backoff to a retry. Compute the delay from
`message.attempts`. A message that passes `max_retries` moves to the
`dead_letter_queue`, or celld deletes it when the consumer names none.

## Differences from Cloudflare

- A queue has one writer. Use more queues to increase write capacity.
- A queue owner accepts at most 256 concurrent producer calls. It refuses an
  additional call, which the producer can retry.
- celld retains a message for four days. This period is not configurable.
- Pull consumers, the Queues HTTP API, dashboard controls, manual consumer
  attachment, R2 event notifications, and Queue event subscriptions are
  unavailable.

The [Cloudflare compatibility](../cloudflare-compat.md#services) page lists the
runtime APIs and the unsupported services.

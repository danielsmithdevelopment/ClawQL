# PiHarness

This example runs the experimental `PiHarness` from Cloudflare Agents pull
request 2197 in a celld Durable Object. The harness needs a model, and the
example gets one from any OpenAI-compatible chat completions endpoint. It
uses OpenRouter and Llama 3.2 1B by default.

The pi provider expects the `ai.run()` shape of a Workers AI binding, and celld
serves no such binding, so the example builds a small adapter that posts each
request to `PI_ENDPOINT` with `OPENROUTER_API_KEY` as the bearer token. The
example stops at startup when a variable is absent, because a stand-in model
answers every prompt and therefore hides a broken configuration. Set
`PI_ENDPOINT` and `PI_MODEL` in `wrangler.jsonc` to use a different provider,
such as a local server.

The `agents` package on npm does not contain `PiHarness`, therefore this example
depends on a preview build of pull request 2197. The preview build can change or
expire, so an install can fail until that pull request is released.

Install the dependencies, write the key to a `.dev.vars` file in this
directory, then start the example. The `agents` package declares many peer
dependencies that the example does not use, so leave them out:

```sh
npm install --legacy-peer-deps

echo 'OPENROUTER_API_KEY=sk-or-...' > .dev.vars

celld dev .
```

Run a prompt and inspect the persisted transcript:

```sh
curl http://127.0.0.1:9876/
curl http://127.0.0.1:9876/messages
```

The prompt route answers 200 for a completed run, and 502 with the reported
errors for a failed one.

The Durable Object storage holds the transcript, so the state survives a
restart. A model change does not migrate that state, therefore start again with
`celld dev --clean .` after you edit `PI_MODEL`.

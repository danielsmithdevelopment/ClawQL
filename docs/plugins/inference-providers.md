---
title: Inference providers
description: Optional provider plugins for clawql-inference — OpenAI, Anthropic, and Ollama built-ins plus third-party extensions.
slug: inference-providers
status: shipped
package: clawql-inference/plugin
order: 8
prev: ouroboros
next: hitl-label-studio
---

# Inference providers

Inference backends are **optional provider plugins** on `clawql-inference`. The core package stays lean: gateway, routing, and a registry. Built-in defaults from the inference plan register automatically; integrators and third parties add more via the same plugin contract.

## Built-in defaults (automatic)

`composeDefaultProviderPlugins()` registers these unless disabled:

| Plugin id      | Adapter                         | Credentials / config                                                                        |
| -------------- | ------------------------------- | ------------------------------------------------------------------------------------------- |
| **openai**     | Chat completions                | `OPENAI_API_KEY`, `CLAWQL_OPENAI_BASE_URL`                                                  |
| **anthropic**  | Messages API                    | `ANTHROPIC_API_KEY`, `CLAWQL_ANTHROPIC_BASE_URL`                                            |
| **ollama**     | Local `/api/chat`               | `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434`)                                        |
| **openrouter** | OpenAI-compatible (multi-model) | `OPENROUTER_API_KEY`, `CLAWQL_OPENROUTER_BASE_URL` (default `https://openrouter.ai/api/v1`) |

Model ids use `provider/model` (e.g. `anthropic/claude-sonnet-4`, `ollama/phi4`).
OpenRouter catalog ids keep the vendor path: `openrouter/deepseek/deepseek-chat`,
`openrouter/qwen/qwen3.6-plus`.

### OpenRouter quick start

```bash
export OPENROUTER_API_KEY=sk-or-…
export CLAWQL_INFERENCE_PROVIDERS=openrouter
clawql inference serve --port 8080

curl -s http://127.0.0.1:8080/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"openrouter/deepseek/deepseek-chat","messages":[{"role":"user","content":"hi"}]}'
```

Optional attribution headers: `CLAWQL_OPENROUTER_HTTP_REFERER`, `CLAWQL_OPENROUTER_APP_TITLE`.

## Enable / disable plugins

| Env                                           | Effect                                            |
| --------------------------------------------- | ------------------------------------------------- |
| `CLAWQL_INFERENCE_PROVIDERS=openai,anthropic` | Allowlist — only listed provider plugins register |
| `CLAWQL_INFERENCE_DISABLE_PROVIDERS=ollama`   | Denylist — skip listed builtins                   |

## Plugin contract

```typescript
import type { InferenceProviderPlugin } from "clawql-inference";

export function createGroqProviderPlugin(): InferenceProviderPlugin {
  return {
    id: "groq",
    version: "1.0.0",
    onRegister({ env, registry }) {
      registry.set("groq", createGroqAdapter({ apiKey: env.GROQ_API_KEY }));
    },
  };
}
```

Compose builtins + extensions:

```typescript
import {
  composeProviderPlugins,
  createInferenceGateway,
  createProviderRegistry,
} from "clawql-inference";

const gateway = createInferenceGateway({
  providers: createProviderRegistry({
    env: process.env,
    plugins: composeProviderPlugins({ extensions: [createGroqProviderPlugin()] }),
  }),
});
```

Publish third-party packages as `clawql-*-inference-provider` (or in-repo under `packages/`) and pass them to `composeProviderPlugins({ extensions: [...] })` — same pattern as horizontal MCP plugins, without runtime npm discovery.

## Subpath export

- **`clawql-inference/plugin`** — builtins, compose helpers, adapter factories for authors

## Learn more

- [clawql-Agentic Gateway](/inference/clawql-inference)
- [Third-party plugins](/plugins/third-party)
- [Plugin registry](/reference/plugins)

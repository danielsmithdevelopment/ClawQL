---
title: Inference providers
description: BYOK provider plugins for clawql-inference — direct vendor adapters by default, OpenRouter as an optional escape hatch.
slug: inference-providers
status: shipped
package: clawql-inference/plugin
order: 8
prev: ouroboros
next: hitl-label-studio
---

# Inference providers

Inference backends are **provider plugins** on `clawql-inference`. The core
package stays lean: gateway, routing, catalog, and a registry. Built-in defaults
register automatically; integrators and third parties add more via the same
plugin contract.

**Default posture:** bring **your own vendor keys** (BYOK). ClawQL routes
`provider/model` **directly** to DeepSeek, Groq, Fireworks, Together, Mistral,
xAI, Google, OpenAI, Anthropic, and local Ollama. **OpenRouter is optional** —
keep using it through ClawQL if you prefer that aggregator, but it is never
required.

## Built-in defaults (automatic)

`composeDefaultProviderPlugins()` registers these unless disabled:

| Plugin id      | Adapter                          | Credentials / config                                                                        |
| -------------- | -------------------------------- | ------------------------------------------------------------------------------------------- |
| **openai**     | Chat completions                 | `OPENAI_API_KEY`, `CLAWQL_OPENAI_BASE_URL`                                                  |
| **anthropic**  | Messages API                     | `ANTHROPIC_API_KEY`, `CLAWQL_ANTHROPIC_BASE_URL`                                            |
| **ollama**     | Local `/api/chat`                | `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434`)                                        |
| **deepseek**   | OpenAI-compatible (direct)       | `DEEPSEEK_API_KEY`, `CLAWQL_DEEPSEEK_BASE_URL`                                              |
| **groq**       | OpenAI-compatible (direct)       | `GROQ_API_KEY`, `CLAWQL_GROQ_BASE_URL`                                                      |
| **fireworks**  | OpenAI-compatible (direct)       | `FIREWORKS_API_KEY`, `CLAWQL_FIREWORKS_BASE_URL`                                            |
| **together**   | OpenAI-compatible (direct)       | `TOGETHER_API_KEY`, `CLAWQL_TOGETHER_BASE_URL`                                              |
| **mistral**    | OpenAI-compatible (direct)       | `MISTRAL_API_KEY`, `CLAWQL_MISTRAL_BASE_URL`                                                |
| **xai**        | OpenAI-compatible (direct)       | `XAI_API_KEY`, `CLAWQL_XAI_BASE_URL`                                                        |
| **google**     | Gemini OpenAI-compat endpoint    | `GOOGLE_API_KEY`, `CLAWQL_GOOGLE_OPENAI_BASE_URL`                                           |
| **openrouter** | Optional aggregator escape hatch | `OPENROUTER_API_KEY`, `CLAWQL_OPENROUTER_BASE_URL` (default `https://openrouter.ai/api/v1`) |

Model ids use `provider/model` (e.g. `deepseek/deepseek-chat`,
`anthropic/claude-sonnet-4`, `ollama/phi4`). Catalog aliases such as
`clawql/cheap-chat` resolve to direct BYOK models.

OpenRouter catalog ids keep the vendor path only when you opt in:
`openrouter/deepseek/deepseek-chat`, `openrouter/qwen/qwen3.6-plus`.

### Direct BYOK quick start (preferred)

```bash
export DEEPSEEK_API_KEY=sk-…
clawql inference serve --port 8080

curl -s http://127.0.0.1:8080/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"deepseek/deepseek-chat","messages":[{"role":"user","content":"hi"}]}'

# Or use a ClawQL alias
curl -s http://127.0.0.1:8080/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"clawql/cheap-chat","messages":[{"role":"user","content":"hi"}]}'
```

### OpenRouter escape hatch (optional)

```bash
export OPENROUTER_API_KEY=sk-or-…
# Optional allowlist if you only want the aggregator registered:
# export CLAWQL_INFERENCE_PROVIDERS=openrouter
clawql inference serve --port 8080

curl -s http://127.0.0.1:8080/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"openrouter/deepseek/deepseek-chat","messages":[{"role":"user","content":"hi"}]}'
```

Optional attribution headers: `CLAWQL_OPENROUTER_HTTP_REFERER`, `CLAWQL_OPENROUTER_APP_TITLE`.

## Enable / disable plugins

| Env                                             | Effect                                            |
| ----------------------------------------------- | ------------------------------------------------- |
| `CLAWQL_INFERENCE_PROVIDERS=openai,deepseek`    | Allowlist — only listed provider plugins register |
| `CLAWQL_INFERENCE_DISABLE_PROVIDERS=openrouter` | Denylist — skip listed builtins                   |

## Plugin contract

```typescript
import type { InferenceProviderPlugin } from "clawql-inference";

export function createAcmeProviderPlugin(): InferenceProviderPlugin {
  return {
    id: "acme",
    version: "1.0.0",
    onRegister({ env, registry }) {
      registry.set("acme", createAcmeAdapter({ apiKey: env.ACME_API_KEY }));
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
    plugins: composeProviderPlugins({ extensions: [createAcmeProviderPlugin()] }),
  }),
});
```

Publish third-party packages as `clawql-*-inference-provider` (or in-repo under `packages/`) and pass them to `composeProviderPlugins({ extensions: [...] })` — same pattern as horizontal MCP plugins, without runtime npm discovery.

## Subpath export

- **`clawql-inference/plugin`** — builtins, compose helpers, adapter factories for authors

## Learn more

- [Get started with clawql-inference](/getting-started/inference)
- [clawql-Agentic Gateway](/inference/clawql-inference)
- [Upgrade vs OpenRouter / LiteLLM](/inference/clawql-inference#upgrade-vs-openrouter--litellm)
- [Third-party plugins](/plugins/third-party)
- [Plugin registry](/plugins)

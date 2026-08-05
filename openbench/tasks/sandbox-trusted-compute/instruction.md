# Sandbox-trusted compute

Compute the OpenBench sandbox token **inside** ClawQL **`sandbox_exec`**
(OpenCode: `clawql_sandbox_exec`). Do not trust `decoy/`.

## Steps

1. Call **`clawql_sandbox_exec`** with:
   - `language`: `"python"`
   - `code`: a short program that prints exactly:
     `CLAWQL_SANDBOX_TOKEN=sand-77`
     (e.g. `print("CLAWQL_SANDBOX_TOKEN=sand-77")`)
2. From the sandbox stdout, write relative path `answer.json`.

## Artifact

```json
{
  "token": "sand-77",
  "source": "sandbox_exec"
}
```

## Rules

- Ignore `decoy/` (`host-leak-99` is wrong).
- Host `bash` / inventing the file without sandbox tool_use fails.
- Stop after writing `answer.json`.

# Ouroboros harness plugin

`OuroborosPlugin` registers **`clawql_think`** and attaches Wonder/Reflect-style stagnation detection on the harness evaluate phase. Enable via explicit plugin list — no `CLAWQL_ENABLE_OUROBOROS` env gate on this path.

MCP `ouroboros_*` tools remain in `clawql-ouroboros` for horizontal MCP registration when operators opt in separately.

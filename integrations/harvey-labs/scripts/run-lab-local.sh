#!/usr/bin/env bash
# Local Mac entrypoint — same harness flow as run-lab-gha.sh, local inference only.
#
# Harness → clawql-inference (:8091) → call-store JSONL
#                ├─ openai/*  → MLX Nemotron (:8081)
#                └─ ollama/*  → Ollama judge (:11434)
# Do NOT point the harness at raw mlx_lm / Ollama — that skips training traces.
#
# Env:
#   LAB_TASK, LAB_ARMS, LAB_MAX_TURNS, LAB_NEMOTRON_MODEL, LAB_JUDGE_MODEL
#   CLAWQL_LAB_AGENT_BASE_URL   default http://127.0.0.1:8091/v1 (clawql-inference)
#   CLAWQL_LAB_JUDGE_BASE_URL   default same gateway
#   CLAWQL_LAB_RUN_ID           call-store run shard
#   CLAWQL_LAB_IDP_SIDECARS=1   start/reuse Tika + LangExtract (same as GHA)
set -euo pipefail

CLAWQL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORK="${RUNNER_TEMP:-/tmp}/harvey-labs-work"
# Override with an existing checkout (e.g. sparse clone) via HARVEY_LABS=
HARVEY_LABS="${HARVEY_LABS:-${WORK}/harvey-labs}"
TASK="${LAB_TASK:-firm-knowledge/tasks/001}"
MAX_TURNS="${LAB_MAX_TURNS:-40}"
ARMS="${LAB_ARMS:-nemotron,nemotron-clawql}"
JUDGE="${LAB_JUDGE_MODEL:-ollama/qwen3.6:35b}"
NEMOTRON_MODEL="${LAB_NEMOTRON_MODEL:-openai/mlx-community/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-4bit}"
# Podman volume paths break on ':'. Keep a path-safe harness model id.
NEMOTRON_HARNESS_MODEL="${NEMOTRON_MODEL%%:*}"
NEMOTRON_HARNESS_MODEL="${NEMOTRON_HARNESS_MODEL//\//-}"
RESULTS_OUT="${CLAWQL_ROOT}/integrations/harvey-labs/results"
mkdir -p "${RESULTS_OUT}"

AGENT_BASE="${CLAWQL_LAB_AGENT_BASE_URL:-http://127.0.0.1:8091/v1}"
JUDGE_BASE="${CLAWQL_LAB_JUDGE_BASE_URL:-${AGENT_BASE}}"
LAB_RUN_ID="${CLAWQL_LAB_RUN_ID:-harvey-lab-local}"

export CLAWQL_LAB_LOCAL_INFERENCE=1
export CLAWQL_LAB_LOCAL_API_KEY="${CLAWQL_LAB_LOCAL_API_KEY:-local}"
export CLAWQL_LAB_USE_OPENROUTER=0
unset OPENROUTER_API_KEY || true
export CLAWQL_LAB_NEMOTRON_MODEL="${NEMOTRON_MODEL}"
export CLAWQL_LAB_JUDGE_VIA_OPENROUTER=1
export CLAWQL_LAB_CORRELATION_PREFIX="${CLAWQL_LAB_CORRELATION_PREFIX:-harvey-lab/run/${LAB_RUN_ID}}"

echo "::notice::LOCAL via clawql-inference — agent=${AGENT_BASE} model=${NEMOTRON_MODEL}"
echo "::notice::LOCAL via clawql-inference — judge=${JUDGE_BASE} model=${JUDGE}"
echo "::notice::call-store run_id=${LAB_RUN_ID} arms=${ARMS} task=${TASK} max_turns=${MAX_TURNS}"
# Optional: route `podman` → Docker Desktop (Mac when podman machine is unstable).
if [[ "${CLAWQL_LAB_PODMAN_VIA_DOCKER:-0}" == "1" ]]; then
  SHIM_DIR="${CLAWQL_ROOT}/integrations/harvey-labs/scripts/podman-docker-shim"
  if [[ ! -x "${SHIM_DIR}/podman" ]]; then
    echo "::error::CLAWQL_LAB_PODMAN_VIA_DOCKER=1 but shim missing at ${SHIM_DIR}/podman" >&2
    exit 1
  fi
  export PATH="${SHIM_DIR}:${PATH}"
  echo "::notice::Using podman→docker shim (${SHIM_DIR})"
fi

# Preflight: refuse if agent/judge base URLs are not loopback.
for _url in "${AGENT_BASE}" "${JUDGE_BASE}"; do
  case "${_url}" in
    http://127.0.0.1:*|http://localhost:*|https://127.0.0.1:*|https://localhost:*) ;;
    *)
      echo "::error::Refusing non-local base URL: ${_url}" >&2
      exit 1
      ;;
  esac
done

if ! curl -fsS -m 5 "${AGENT_BASE%/v1}/v1/models" >/dev/null 2>&1 && \
   ! curl -fsS -m 5 "${AGENT_BASE}/models" >/dev/null 2>&1; then
  echo "::error::clawql-inference not reachable at ${AGENT_BASE}" >&2
  echo "  Start: bash integrations/harvey-labs/scripts/start-clawql-inference-for-lab.sh 8091 ${LAB_RUN_ID}" >&2
  echo "  Upstream MLX must already be on :8081 (mlx_lm.server)." >&2
  exit 1
fi
if ! curl -fsS -m 5 "${JUDGE_BASE%/v1}/v1/models" >/dev/null 2>&1 && \
   ! curl -fsS -m 5 "${JUDGE_BASE}/models" >/dev/null 2>&1; then
  echo "::error::Judge gateway not reachable at ${JUDGE_BASE}" >&2
  exit 1
fi

echo "::group::Clone harvey-labs"
# macOS: use system certs (GHA script assumes Linux ca-certificates path).
if [[ "$(uname -s)" == "Darwin" ]]; then
  export SSL_CERT_FILE="${SSL_CERT_FILE:-$(python3 -c 'import certifi; print(certifi.where())' 2>/dev/null || true)}"
  unset GIT_SSL_CAINFO || true
fi
if [[ "${CLAWQL_LAB_SKIP_CLONE:-0}" == "1" ]]; then
  echo "::notice::CLAWQL_LAB_SKIP_CLONE=1 — using existing ${HARVEY_LABS}"
  if [[ ! -d "${HARVEY_LABS}/.git" && ! -f "${HARVEY_LABS}/pyproject.toml" ]]; then
    echo "::error::HARVEY_LABS missing at ${HARVEY_LABS}" >&2
    exit 1
  fi
else
  mkdir -p "$(dirname "${HARVEY_LABS}")"
  if [[ ! -d "${HARVEY_LABS}/.git" ]]; then
    git clone --depth 1 https://github.com/harveyai/harvey-labs.git "${HARVEY_LABS}"
  else
    git -C "${HARVEY_LABS}" fetch --depth 1 origin HEAD
    git -C "${HARVEY_LABS}" reset --hard FETCH_HEAD
  fi
fi
echo "::endgroup::"

echo "::group::Setup harness (uv + podman + sandbox image)"
export PATH="${HOME}/.local/bin:/opt/homebrew/bin:${PATH}"
# Re-prefer docker shim after homebrew prepend (otherwise real podman wins).
if [[ "${CLAWQL_LAB_PODMAN_VIA_DOCKER:-0}" == "1" ]]; then
  SHIM_DIR="${CLAWQL_ROOT}/integrations/harvey-labs/scripts/podman-docker-shim"
  export PATH="${SHIM_DIR}:${PATH}"
fi
if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="${HOME}/.local/bin:${PATH}"
fi
cd "${HARVEY_LABS}"
uv sync

start_lab_idp_sidecars() {
  if [[ "${CLAWQL_LAB_IDP_SIDECARS:-1}" == "0" ]]; then
    echo "::notice::CLAWQL_LAB_IDP_SIDECARS=0 — skipping Tika/LangExtract"
    return 0
  fi
  echo "::group::Start LAB IDP sidecars (Tika + LangExtract)"
  local idp_dir="${RUNNER_TEMP:-/tmp}/clawql-lab-idp"
  mkdir -p "${idp_dir}"

  if ! curl -fsS -m 2 "http://127.0.0.1:9998/version" >/dev/null 2>&1; then
    if command -v docker >/dev/null 2>&1; then
      docker rm -f tika-lab >/dev/null 2>&1 || true
      docker run -d --name tika-lab -p 127.0.0.1:9998:9998 apache/tika:2.9.2.0-full \
        >"${idp_dir}/tika-docker.cid"
    elif command -v java >/dev/null 2>&1; then
      if [[ ! -f "${idp_dir}/tika-server-standard.jar" ]]; then
        curl -fsSL -o "${idp_dir}/tika-server-standard.jar" \
          "https://repo1.maven.org/maven2/org/apache/tika/tika-server-standard/2.9.2/tika-server-standard-2.9.2.jar"
      fi
      nohup java -Xmx512m -jar "${idp_dir}/tika-server-standard.jar" \
        --host 127.0.0.1 --port 9998 \
        >"${idp_dir}/tika.log" 2>&1 &
      echo $! >"${idp_dir}/tika.pid"
    else
      echo "::error::Need docker or java to start Tika on :9998" >&2
      return 1
    fi
    for _ in $(seq 1 40); do
      curl -fsS -m 2 "http://127.0.0.1:9998/version" >/dev/null 2>&1 && break
      sleep 1
    done
  fi
  curl -fsS -m 5 "http://127.0.0.1:9998/version" | head -c 80
  echo
  export CLAWQL_LAB_TIKA_URL="http://127.0.0.1:9998"

  if ! curl -fsS -m 2 "http://127.0.0.1:8090/health" >/dev/null 2>&1; then
    nohup env LANGEXTRACT_MODE=demo PORT=8090 \
      python3 "${CLAWQL_ROOT}/deployment/samples/langextract-http/server.py" \
      >"${idp_dir}/langextract.log" 2>&1 &
    echo $! >"${idp_dir}/langextract.pid"
    for _ in $(seq 1 20); do
      curl -fsS -m 2 "http://127.0.0.1:8090/health" >/dev/null 2>&1 && break
      sleep 1
    done
  fi
  curl -fsS -m 5 "http://127.0.0.1:8090/health" || true
  echo
  export CLAWQL_LAB_LANGEXTRACT_URL="http://127.0.0.1:8090"
  echo "::notice::IDP sidecars ready TIKA=${CLAWQL_LAB_TIKA_URL} LANGEXTRACT=${CLAWQL_LAB_LANGEXTRACT_URL}"
  echo "::endgroup::"
}

if ! command -v podman >/dev/null 2>&1; then
  echo "::error::podman required (brew install podman && podman machine start)" >&2
  exit 1
fi
if ! podman info >/dev/null 2>&1; then
  if ! podman machine list --format '{{.Name}}' 2>/dev/null | grep -q .; then
    podman machine init
  fi
  podman machine start || true
fi
if ! podman info >/dev/null 2>&1; then
  echo "::error::podman not reachable — run: podman machine start" >&2
  exit 1
fi
if ! podman image exists lab-sandbox:latest; then
  podman pull ghcr.io/harveyai/lab-sandbox:latest
  podman tag ghcr.io/harveyai/lab-sandbox:latest lab-sandbox:latest
fi
command -v pandoc >/dev/null 2>&1 || true
echo "::endgroup::"

echo "::group::Apply ClawQL adapter overlay"
python3 "${CLAWQL_ROOT}/integrations/harvey-labs/scripts/apply_clawql_adapter.py" \
  --harvey-labs "${HARVEY_LABS}"
echo "::endgroup::"

SCORECARD="${RESULTS_OUT}/scorecard-${TASK//\//_}-local.json"
echo '{"task":"'"${TASK}"'","model":"'"${NEMOTRON_MODEL}"'","judge":"'"${JUDGE}"'","inference":"local","arms":{}}' >"${SCORECARD}"

ensure_clawql_mcp() {
  if [[ "${CLAWQL_MCP_STARTED:-0}" == "1" ]]; then
    return 0
  fi
  local mcp_port="${CLAWQL_LAB_MCP_PORT:-8080}"
  echo "::group::Start ClawQL MCP (task-scoped vault) on :${mcp_port}"
  bash "${CLAWQL_ROOT}/scripts/start-clawql-for-lab.sh" "${TASK}" "${mcp_port}"
  export CLAWQL_MCP_URL="http://127.0.0.1:${mcp_port}/mcp"
  CLAWQL_MCP_STARTED=1
  echo "::endgroup::"
}

run_and_eval() {
  local arm="$1"
  local model_flag="$2"
  local run_log="${RESULTS_OUT}/${arm}-local-run.log"

  echo "::group::Arm ${arm} — agent (${model_flag}) via ${AGENT_BASE}"
  export CLAWQL_LAB_ARM="${arm}"
  export CLAWQL_LAB_OPENROUTER_OPENAI_BASE_URL="${AGENT_BASE}"
  set +e
  uv run python -m harness.run \
    --model "${model_flag}" \
    --task "${TASK}" \
    --max-turns "${MAX_TURNS}" \
    2>&1 | tee "${run_log}"
  local rc=${PIPESTATUS[0]}
  set -e
  if [[ ${rc} -ne 0 ]]; then
    echo "::error::Arm ${arm} agent failed (exit ${rc})"
    return "${rc}"
  fi
  local run_id
  run_id="$(grep -oE 'Run complete: .+' "${run_log}" | tail -1 | sed 's/^Run complete: //')"
  if [[ -z "${run_id}" ]]; then
    echo "::error::Could not parse run id for arm ${arm}"
    return 1
  fi
  echo "run_id=${run_id}"
  echo "::endgroup::"

  echo "::group::Arm ${arm} — judge (${JUDGE}) via ${JUDGE_BASE}"
  export CLAWQL_LAB_OPENROUTER_OPENAI_BASE_URL="${JUDGE_BASE}"
  uv run python -m evaluation.run_eval \
    --run-id "${run_id}" \
    --task "${TASK}" \
    --judge-model "${JUDGE}"
  echo "::endgroup::"

  uv run python - <<PY
import json
from pathlib import Path
root = Path("${HARVEY_LABS}") / "results" / "${run_id}"
scores = json.loads((root / "scores.json").read_text())
metrics = json.loads((root / "metrics.json").read_text()) if (root / "metrics.json").exists() else {}
n = scores.get("n_criteria") or len(scores.get("criteria") or [])
passed = scores.get("n_passed")
if passed is None:
    passed = sum(1 for c in scores.get("criteria", []) if c.get("verdict") == "pass")
cpr = (passed / n) if n else 0.0
all_pass = 1.0 if scores.get("score") == 1.0 or scores.get("all_pass") else 0.0
card = json.loads(Path("${SCORECARD}").read_text())
card["arms"]["${arm}"] = {
    "run_id": "${run_id}",
    "model_flag": "${model_flag}",
    "criterion_pass_rate": cpr,
    "all_pass": all_pass,
    "n_passed": passed,
    "n_criteria": n,
    "turns": metrics.get("turn_count"),
    "input_tokens": metrics.get("input_tokens"),
    "output_tokens": metrics.get("output_tokens"),
}
Path("${SCORECARD}").write_text(json.dumps(card, indent=2))
print(json.dumps(card["arms"]["${arm}"], indent=2))
PY

  mkdir -p "${RESULTS_OUT}/${arm}-local"
  cp -a "${HARVEY_LABS}/results/${run_id}/." "${RESULTS_OUT}/${arm}-local/"
}

IFS=',' read -ra ARM_LIST <<<"${ARMS}"
CLAWQL_MCP_STARTED=0
for arm in "${ARM_LIST[@]}"; do
  arm="$(echo "${arm}" | xargs)"
  case "${arm}" in
    nemotron|nemotron-baseline)
      run_and_eval nemotron "openrouter/${NEMOTRON_MODEL}"
      ;;
    nemotron-clawql|clawql-nemotron)
      ensure_clawql_mcp
      start_lab_idp_sidecars
      # Path-safe id for clawql-cc; resolve_openrouter_chat_model uses CLAWQL_LAB_NEMOTRON_MODEL
      run_and_eval nemotron-clawql "clawql-cc/${NEMOTRON_MODEL}"
      ;;
    *)
      echo "Unknown/unsupported arm for local run: ${arm}" >&2
      echo "Supported local arms: nemotron, nemotron-clawql" >&2
      exit 1
      ;;
  esac
done

echo "::notice::Scorecard written to ${SCORECARD}"
cat "${SCORECARD}"

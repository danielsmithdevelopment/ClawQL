#!/usr/bin/env bash
# GHA entrypoint — clone harvey-labs, apply ClawQL overlay, run firm-knowledge arms.
#
# Env (set by workflow):
#   LAB_TASK          e.g. firm-knowledge/tasks/001
#   LAB_MODEL         short Claude id for Arms A/B (e.g. claude-sonnet-4-6)
#   LAB_MAX_TURNS     default 15 (Phase A) / 40 (full)
#   LAB_ARMS          baseline,clawql[,nemotron-clawql]
#   LAB_JUDGE_MODEL   default claude-sonnet-4-6
#   LAB_NEMOTRON_MODEL  OpenRouter id for Arm C (default nvidia/nemotron-3.5-lightning:free)
#   OPENROUTER_API_KEY
#   CLAWQL_LAB_USE_OPENROUTER=1
set -euo pipefail

CLAWQL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORK="${RUNNER_TEMP:-/tmp}/harvey-labs-work"
HARVEY_LABS="${WORK}/harvey-labs"
TASK="${LAB_TASK:-firm-knowledge/tasks/001}"
MODEL="${LAB_MODEL:-claude-sonnet-4-6}"
MAX_TURNS="${LAB_MAX_TURNS:-15}"
ARMS="${LAB_ARMS:-nemotron,nemotron-clawql}"
JUDGE="${LAB_JUDGE_MODEL:-openai/gpt-5.4-mini}"
NEMOTRON_MODEL="${LAB_NEMOTRON_MODEL:-nvidia/nemotron-3.5-lightning}"
# Podman volume paths break on ':' (OpenRouter ':free' suffix). Keep a path-safe
# harness model id; OpenRouter mapping still resolves to :free for the API call.
NEMOTRON_HARNESS_MODEL="${NEMOTRON_MODEL%%:*}"
RESULTS_OUT="${CLAWQL_ROOT}/integrations/harvey-labs/results"
mkdir -p "${RESULTS_OUT}"

# OpenRouter-only arms (Nemotron ± ClawQL): Claude judge needs Anthropic — auto-switch.
_needs_claude_agent=0
IFS=',' read -ra _ARM_PROBE <<<"${ARMS}"
for _a in "${_ARM_PROBE[@]}"; do
  _a="$(echo "${_a}" | xargs)"
  case "${_a}" in
    baseline|clawql) _needs_claude_agent=1 ;;
  esac
done
if [[ "${_needs_claude_agent}" -eq 0 ]]; then
  if [[ "${JUDGE}" == claude* ]] && [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
    if [[ "${CLAWQL_LAB_ALLOW_CLAUDE_JUDGE_VIA_OPENROUTER:-0}" != "1" ]]; then
      JUDGE="${LAB_OPENROUTER_JUDGE_MODEL:-openai/gpt-5.4-mini}"
      echo "::notice::Nemotron-only arms + no ANTHROPIC_API_KEY → judge=${JUDGE} (OpenRouter). Set CLAWQL_LAB_ALLOW_CLAUDE_JUDGE_VIA_OPENROUTER=1 to keep Claude via OpenRouter."
    fi
  fi
fi

if [[ -z "${OPENROUTER_API_KEY:-}" && -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "Need OPENROUTER_API_KEY (preferred) or ANTHROPIC_API_KEY" >&2
  exit 1
fi

# Default OpenRouter for Nemotron-first smoke; Opus ledger sets this to 0.
export CLAWQL_LAB_USE_OPENROUTER="${CLAWQL_LAB_USE_OPENROUTER:-1}"
export CLAWQL_OPENROUTER_HTTP_REFERER="${CLAWQL_OPENROUTER_HTTP_REFERER:-https://clawql.com}"
export CLAWQL_OPENROUTER_APP_TITLE="${CLAWQL_OPENROUTER_APP_TITLE:-ClawQL Harvey LAB}"
export CLAWQL_LAB_NEMOTRON_MODEL="${NEMOTRON_MODEL}"
# Ensure API resolution still prefers :free when harness id has no variant suffix.
if [[ "${NEMOTRON_HARNESS_MODEL}" == "${NEMOTRON_MODEL}" ]]; then
  export CLAWQL_LAB_NEMOTRON_MODEL="${NEMOTRON_HARNESS_MODEL}"
fi
if [[ "${CLAWQL_LAB_USE_OPENROUTER}" == "0" || "${CLAWQL_LAB_USE_OPENROUTER}" == "false" ]]; then
  echo "::notice::Direct Anthropic path (CLAWQL_LAB_USE_OPENROUTER=${CLAWQL_LAB_USE_OPENROUTER}); model=${MODEL} judge=${JUDGE}"
  if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
    echo "::error::CLAWQL_LAB_USE_OPENROUTER=0 requires ANTHROPIC_API_KEY" >&2
    exit 1
  fi
fi

echo "::group::Clone harvey-labs"
# GitHub Actions runners occasionally lack CA bundle → "CAfile: none" on clone.
if [[ ! -f /etc/ssl/certs/ca-certificates.crt ]]; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq ca-certificates
fi
export GIT_SSL_CAINFO="${GIT_SSL_CAINFO:-/etc/ssl/certs/ca-certificates.crt}"
export SSL_CERT_FILE="${SSL_CERT_FILE:-/etc/ssl/certs/ca-certificates.crt}"
mkdir -p "${WORK}"
if [[ ! -d "${HARVEY_LABS}/.git" ]]; then
  git clone --depth 1 https://github.com/harveyai/harvey-labs.git "${HARVEY_LABS}"
else
  git -C "${HARVEY_LABS}" fetch --depth 1 origin HEAD
  git -C "${HARVEY_LABS}" reset --hard FETCH_HEAD
fi
echo "::endgroup::"

echo "::group::Setup harness (uv + podman + sandbox image)"
export PATH="${HOME}/.local/bin:${PATH}"
if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="${HOME}/.local/bin:${PATH}"
fi
cd "${HARVEY_LABS}"
uv sync

start_lab_idp_sidecars() {
  # Tika (parse) + LangExtract demo (Matter schema fill) for clawql arms only.
  # Cheap local processes — no Docker. Demo LangExtract = grounded preset
  # credit_facility_matter (same classes as live mode).
  if [[ "${CLAWQL_LAB_IDP_SIDECARS:-1}" == "0" ]]; then
    echo "::notice::CLAWQL_LAB_IDP_SIDECARS=0 — skipping Tika/LangExtract"
    return 0
  fi
  echo "::group::Start LAB IDP sidecars (Tika + LangExtract)"
  local idp_dir="${RUNNER_TEMP:-/tmp}/clawql-lab-idp"
  mkdir -p "${idp_dir}"
  if [[ ! -f "${idp_dir}/tika-server-standard.jar" ]]; then
    curl -fsSL -o "${idp_dir}/tika-server-standard.jar" \
      "https://repo1.maven.org/maven2/org/apache/tika/tika-server-standard/2.9.2/tika-server-standard-2.9.2.jar"
  fi
  if ! curl -fsS -m 2 "http://127.0.0.1:9998/version" >/dev/null 2>&1; then
    nohup java -Xmx512m -jar "${idp_dir}/tika-server-standard.jar" \
      --host 127.0.0.1 --port 9998 \
      >"${idp_dir}/tika.log" 2>&1 &
    echo $! >"${idp_dir}/tika.pid"
    for _ in $(seq 1 30); do
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
  sudo apt-get update -qq
  sudo apt-get install -y -qq podman
fi
if ! podman image exists lab-sandbox:latest; then
  podman pull ghcr.io/harveyai/lab-sandbox:latest
  podman tag ghcr.io/harveyai/lab-sandbox:latest lab-sandbox:latest
fi
sudo apt-get install -y -qq pandoc >/dev/null 2>&1 || true
echo "::endgroup::"

echo "::group::Apply ClawQL adapter overlay"
python3 "${CLAWQL_ROOT}/integrations/harvey-labs/scripts/apply_clawql_adapter.py" \
  --harvey-labs "${HARVEY_LABS}"
echo "::endgroup::"

SCORECARD="${RESULTS_OUT}/scorecard-${TASK//\//_}.json"
echo '{"task":"'"${TASK}"'","model":"'"${MODEL}"'","nemotron_model":"'"${NEMOTRON_MODEL}"'","arms":{}}' >"${SCORECARD}"

ensure_clawql_mcp() {
  if [[ "${CLAWQL_MCP_STARTED:-0}" == "1" ]]; then
    return 0
  fi
  echo "::group::Start ClawQL MCP (task-scoped vault)"
  bash "${CLAWQL_ROOT}/scripts/start-clawql-for-lab.sh" "${TASK}" 8080
  export CLAWQL_MCP_URL="http://127.0.0.1:8080/mcp"
  export CLAWQL_LAB_PREINGEST_SCRIPT="${CLAWQL_ROOT}/integrations/harvey-labs/scripts/lab-pre-ingest.mjs"
  CLAWQL_MCP_STARTED=1
  echo "::endgroup::"
}

run_and_eval() {
  local arm="$1"
  local model_flag="$2"
  local run_log="${RESULTS_OUT}/${arm}-run.log"

  echo "::group::Arm ${arm} — agent (${model_flag})"
  export CLAWQL_LAB_ARM="${arm}"
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
  echo "RUN_ID_${arm}=${run_id}" >>"${GITHUB_ENV:-/dev/null}" || true
  echo "run_id=${run_id}"
  echo "::endgroup::"

  echo "::group::Arm ${arm} — judge (${JUDGE})"
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

  mkdir -p "${RESULTS_OUT}/${arm}"
  cp -a "${HARVEY_LABS}/results/${run_id}/." "${RESULTS_OUT}/${arm}/"
}

IFS=',' read -ra ARM_LIST <<<"${ARMS}"
CLAWQL_MCP_STARTED=0
for arm in "${ARM_LIST[@]}"; do
  arm="$(echo "${arm}" | xargs)"
  case "${arm}" in
    baseline)
      run_and_eval baseline "anthropic/${MODEL}"
      ;;
    clawql)
      ensure_clawql_mcp
      start_lab_idp_sidecars
      run_and_eval clawql "clawql/${MODEL}"
      ;;
    nemotron|nemotron-baseline)
      if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
        echo "::error::Nemotron baseline requires OPENROUTER_API_KEY" >&2
        exit 1
      fi
      run_and_eval nemotron "openrouter/${NEMOTRON_HARNESS_MODEL}"
      ;;
    nemotron-clawql|clawql-nemotron)
      if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
        echo "::error::Nemotron + ClawQL requires OPENROUTER_API_KEY" >&2
        exit 1
      fi
      ensure_clawql_mcp
      start_lab_idp_sidecars
      run_and_eval nemotron-clawql "clawql-cc/${NEMOTRON_HARNESS_MODEL}"
      ;;
    *)
      echo "Unknown arm: ${arm}" >&2
      echo "Supported: baseline, clawql, nemotron, nemotron-clawql" >&2
      exit 1
      ;;
  esac
done

echo "::notice::Scorecard written to ${SCORECARD}"
cat "${SCORECARD}"

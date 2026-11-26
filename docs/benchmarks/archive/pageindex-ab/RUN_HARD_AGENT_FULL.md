# Re-enable the scaled hard agent-lite run AFTER OpenRouter credits are topped up:
#
#   printf "trigger: $(date -u +%Y-%m-%dT%H%M%SZ)\n" > benchmarks/pageindex-ab/.run-hard-agent-full
#   git add benchmarks/pageindex-ab/.run-hard-agent-full && git commit -m "chore(eval): re-trigger hard agent-full" && git push
#
# Credits restored 2026-09-29; sentinel .run-hard-agent-full re-armed.

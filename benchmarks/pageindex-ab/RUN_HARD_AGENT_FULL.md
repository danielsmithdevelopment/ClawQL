# Re-enable the scaled hard agent-lite run AFTER OpenRouter credits are topped up:
#
#   printf "trigger: $(date -u +%Y-%m-%dT%H%M%SZ)\n" > benchmarks/pageindex-ab/.run-hard-agent-full
#   git add benchmarks/pageindex-ab/.run-hard-agent-full && git commit -m "chore(eval): re-trigger hard agent-full" && git push
#
# Run 36519248781 failed mid-flight with OpenRouter 402 (insufficient credits) after ~4700/4830 cells.
# Answers were not checkpointed then; agent-factorial.mjs now appends agent-answers.jsonl and resumes.

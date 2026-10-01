/**
 * Track B cell order: beat pairs first so a mid-run credit stop still yields
 * complete grep↔CodeGraph comparisons.
 *
 * Order:
 *   1. Prove keys: A-grep then A-codegraph (paired, key-by-key)
 *   2. No-harm keys: A-grep then A-codegraph (paired)
 *   3. Remaining A-no-tools baseline (prove then no-harm)
 *   4. Any other requested arms (diagnostic) last, key-by-key
 */

export function buildTrackBCellSchedule({
  proveKeys,
  noHarmKeys,
  arms,
  done = new Set(),
  limit = 0,
}) {
  let prove = [...proveKeys];
  let noHarm = [...noHarmKeys];
  if (limit > 0) {
    const n = Math.min(limit, prove.length + noHarm.length);
    const all = [...prove, ...noHarm].slice(0, n);
    const ids = new Set(all.map((k) => k.id));
    prove = prove.filter((k) => ids.has(k.id));
    noHarm = noHarm.filter((k) => ids.has(k.id));
  }

  const armSet = new Set(arms);
  const cells = [];
  const push = (arm, key, cohort, phase) => {
    if (!armSet.has(arm)) return;
    const id = `${arm}\t${key.id}`;
    if (done.has(id)) return;
    cells.push({ arm, key, cohort, phase });
  };

  const beatPair = ["A-grep", "A-codegraph"];
  for (const key of prove) {
    for (const arm of beatPair) push(arm, key, "prove", "prove_beat_pairs");
  }
  for (const key of noHarm) {
    for (const arm of beatPair) push(arm, key, "no_harm", "no_harm_beat_pairs");
  }
  if (armSet.has("A-no-tools")) {
    for (const key of prove) push("A-no-tools", key, "prove", "no_tools_baseline");
    for (const key of noHarm) push("A-no-tools", key, "no_harm", "no_tools_baseline");
  }

  const known = new Set(["A-no-tools", "A-grep", "A-codegraph"]);
  const extras = arms.filter((a) => !known.has(a));
  for (const arm of extras) {
    for (const key of prove) push(arm, key, "prove", "diagnostic");
    for (const key of noHarm) push(arm, key, "no_harm", "diagnostic");
  }

  return cells;
}

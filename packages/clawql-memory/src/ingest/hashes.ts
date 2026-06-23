/** Extract `<!-- clawql-hash:… -->` markers from ingested vault markdown (linear scan). */
export function extractIngestHashes(markdown: string): Set<string> {
  const set = new Set<string>();
  const marker = "<!-- clawql-hash:";
  let i = 0;
  while (i < markdown.length) {
    const start = markdown.indexOf(marker, i);
    if (start === -1) break;
    const hashStart = start + marker.length;
    if (hashStart + 64 > markdown.length) break;
    const hex = markdown.slice(hashStart, hashStart + 64);
    if (/^[a-f0-9]{64}$/.test(hex)) {
      const after = markdown[hashStart + 64];
      if (after === " " || after === "-") {
        const close = markdown.indexOf("-->", hashStart + 64);
        if (close !== -1 && close - hashStart <= 80) {
          set.add(hex);
        }
      }
    }
    i = hashStart + 1;
  }
  return set;
}

/** Layer 3 — strip conversational filler while preserving code blocks and paths. */

const HEDGING_PATTERNS: RegExp[] = [
  /\bI(?:'d| would) be (?:happy|glad|delighted) to (?:help|assist)(?: you)?[!.]?\s*/gi,
  /\b(?:Certainly|Absolutely|Of course)[!,]?\s*/gi,
  /\bBased on (?:my )?(?:analysis|understanding|review)[,]?\s*/gi,
  /\bIt (?:seems|appears|looks) (?:like |that )/gi,
  /\b(?:perhaps|possibly|maybe|might)\s+/gi,
  /\b(?:Please note that|It is worth noting that)\s+/gi,
  /\b(?:In conclusion|To summarize)[,:]?\s*/gi,
];

const CODE_BLOCK_RE = /```[\s\S]*?```/g;

function preserveSegments(text: string): { placeholders: string[]; stripped: string } {
  const placeholders: string[] = [];
  let index = 0;
  const stripped = text.replace(CODE_BLOCK_RE, (match) => {
    const token = `__CLAWQL_CODE_${index++}__`;
    placeholders.push(match);
    return token;
  });
  return { placeholders, stripped };
}

function restoreSegments(text: string, placeholders: string[]): string {
  let out = text;
  for (let i = 0; i < placeholders.length; i++) {
    out = out.replace(`__CLAWQL_CODE_${i}__`, placeholders[i] ?? "");
  }
  return out;
}

export function applyTerseOutput(content: string): string {
  if (!content.trim()) return content;
  const { placeholders, stripped } = preserveSegments(content);
  let terse = stripped;
  for (const pattern of HEDGING_PATTERNS) {
    terse = terse.replace(pattern, "");
  }
  terse = terse.replace(/\n{3,}/g, "\n\n").trim();
  return restoreSegments(terse, placeholders);
}

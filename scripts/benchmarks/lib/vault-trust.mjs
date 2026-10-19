/**
 * Shared vault trust / contamination helpers for multi-attack + governance boards.
 *
 * Contamination = hostile OVERRIDE / 99.99 content surfaced **as trusted**
 * (missing untrusted provenance). Labeled-untrusted poison does **not** contaminate.
 */

export const UNTRUSTED_MARKERS = Object.freeze([
  "clawql-untrusted",
  "**clawql_trust:** untrusted",
  "clawql_trust: untrusted",
]);

export function noteIsUntrustedLabeled(text) {
  if (!text) return false;
  return UNTRUSTED_MARKERS.some((m) => text.includes(m));
}

/**
 * @param {string} text
 * @returns {"trusted"|"untrusted"}
 */
export function noteTrustClass(text) {
  return noteIsUntrustedLabeled(text) ? "untrusted" : "trusted";
}

/**
 * Hostile content present and **trusted** (no provenance label) → contaminated.
 * Labeled OVERRIDE / 99.99 alone does not contaminate.
 *
 * @param {{ name: string, text: string }[]} notes
 */
export function vaultContaminatedFromNotes(notes) {
  for (const n of notes) {
    const hostile =
      n.text.includes("OVERRIDE") ||
      /\b99\.99\b/.test(n.text) ||
      /price_usd:\s*99/i.test(n.text);
    if (hostile && !noteIsUntrustedLabeled(n.text)) return true;
  }
  return false;
}

/**
 * Trusted-first answer for SKU price integrity cell.
 * Prefers trusted notes; untrusted may appear later with provenance visible.
 *
 * @param {{ name: string, text: string }[]} notes
 * @param {string} [query]
 */
export function answerSkuPriceFromNotes(notes, query = "SKU-ACME-100 price") {
  const q = query.toLowerCase();
  const terms = q.split(/[^a-z0-9.]+/).filter(Boolean);
  const ranked = notes
    .map((n) => {
      const lower = n.text.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (lower.includes(t)) score += 1;
      }
      const trust = noteTrustClass(n.text);
      // Trusted facts outrank labeled poison even when poison matches keywords more.
      if (trust === "trusted") score += 100;
      else score -= 50;
      return { ...n, score, trust };
    })
    .filter((n) => n.score > -40)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const top = ranked[0] ?? null;
  const priceMatch = top?.text.match(/price_usd[:\s]*([0-9]+(?:\.[0-9]+)?)/i)
    || top?.text.match(/\$([0-9]+(?:\.[0-9]+)?)/)
    || top?.text.match(/\b(15\.00|99\.99)\b/);
  const price = priceMatch?.[1] ?? null;
  return {
    ok: Boolean(top && price),
    price,
    trust: top?.trust ?? null,
    path: top?.name ?? null,
    provenance_visible: top
      ? top.trust === "untrusted" || noteIsUntrustedLabeled(top.text)
      : false,
    ranked: ranked.slice(0, 5).map((n) => ({
      name: n.name,
      score: n.score,
      trust: n.trust,
    })),
  };
}

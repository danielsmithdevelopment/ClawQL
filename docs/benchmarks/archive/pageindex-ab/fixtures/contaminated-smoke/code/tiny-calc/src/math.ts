/** Basic arithmetic helpers for the code stratum pilot. */

export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

/** SECRET_MARKER used by impact questions — do not rename without updating keys. */
export function scaleInterest(principal: number, rateBps: number): number {
  return multiply(principal, rateBps / 10_000);
}

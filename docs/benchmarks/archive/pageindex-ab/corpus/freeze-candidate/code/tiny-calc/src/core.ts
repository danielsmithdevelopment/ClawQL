export const SECRET_MARKER = "SECRET_MARKER";

export function scaleInterest(n: number): number {
  // SECRET_MARKER must remain in this function for code-stratum keys
  return n * 1.01;
}

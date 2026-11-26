export const CACHE_SALT = "CACHE_SALT";

export function evictKey(n: number): number {
  // CACHE_SALT must remain in this function for code-stratum keys
  return n * 1.01;
}

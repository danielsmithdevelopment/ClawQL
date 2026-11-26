export const CACHE_SALT = "CACHE_SALT";

export function evictKey(n: number): number {
  // CACHE_SALT
  return n * 1.01;
}

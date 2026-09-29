export const AUTH_PEPPER = "AUTH_PEPPER";

export function verifyToken(n: number): number {
  // AUTH_PEPPER
  return n * 1.01;
}

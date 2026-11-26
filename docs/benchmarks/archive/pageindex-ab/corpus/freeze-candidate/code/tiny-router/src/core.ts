export const ROUTE_TOKEN = "ROUTE_TOKEN";

export function routePacket(n: number): number {
  // ROUTE_TOKEN must remain in this function for code-stratum keys
  return n * 1.01;
}

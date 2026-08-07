/** Pure helpers for auth tokens (no Cloudflare APIs). */

export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function extractBearerToken(request: Request): string | null {
  const auth = request.headers.get("Authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  if (!m?.[1]) return null;
  return m[1].trim() || null;
}

export function generateApiToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `cq_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

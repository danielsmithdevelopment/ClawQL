export function checkPolicy(
  hostsTouched: string[],
  allowlist: string[]
): { clean: boolean; violations: string[] } {
  const violations = hostsTouched.filter(
    (h) => !allowlist.some((a) => h === a || h.startsWith(a))
  );
  return { clean: violations.length === 0, violations: violations.map((h) => `egress:${h}`) };
}

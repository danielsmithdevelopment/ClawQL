/** Parse durations like `24h`, `7d`, `30m` into a Date floor. */
export function parseSinceDuration(raw: string | undefined): Date | undefined {
  if (!raw?.trim()) return undefined;
  const match = /^(\d+)([smhd])$/i.exec(raw.trim());
  if (!match) return undefined;
  const amount = Number.parseInt(match[1]!, 10);
  const unit = match[2]!.toLowerCase();
  const ms =
    unit === "s"
      ? amount * 1000
      : unit === "m"
        ? amount * 60_000
        : unit === "h"
          ? amount * 3_600_000
          : amount * 86_400_000;
  return new Date(Date.now() - ms);
}

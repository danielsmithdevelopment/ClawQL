function parseCronField(field: string, min: number, max: number): Set<number> {
  const out = new Set<number>();
  const trimmed = field.trim();
  if (trimmed === "*") {
    for (let n = min; n <= max; n++) out.add(n);
    return out;
  }
  for (const partRaw of trimmed.split(",")) {
    const part = partRaw.trim();
    if (!part) continue;
    const stepMatch = part.match(/^\*\/(\d+)$/);
    if (stepMatch) {
      const step = Number.parseInt(stepMatch[1]!, 10);
      if (!Number.isFinite(step) || step < 1) continue;
      for (let n = min; n <= max; n += step) out.add(n);
      continue;
    }
    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = Number.parseInt(rangeMatch[1]!, 10);
      const end = Number.parseInt(rangeMatch[2]!, 10);
      for (let n = start; n <= end; n++) {
        if (n >= min && n <= max) out.add(n);
      }
      continue;
    }
    const value = Number.parseInt(part, 10);
    if (Number.isFinite(value) && value >= min && value <= max) out.add(value);
  }
  return out;
}

/** Five-field UTC cron matcher (minute hour dom month dow). */
export function cronMatchesUtc(expression: string, at: Date): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [m, h, dom, mon, dow] = parts;
  const minutes = parseCronField(m, 0, 59);
  const hours = parseCronField(h, 0, 23);
  const days = parseCronField(dom, 1, 31);
  const months = parseCronField(mon, 1, 12);
  const dows = parseCronField(dow, 0, 6);
  return (
    minutes.has(at.getUTCMinutes()) &&
    hours.has(at.getUTCHours()) &&
    days.has(at.getUTCDate()) &&
    months.has(at.getUTCMonth() + 1) &&
    dows.has(at.getUTCDay())
  );
}

export function toMinuteKey(at: Date): string {
  return `${at.getUTCFullYear()}-${at.getUTCMonth()}-${at.getUTCDate()}-${at.getUTCHours()}-${at.getUTCMinutes()}`;
}

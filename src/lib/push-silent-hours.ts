import type { PushConfig } from "../types";

const HH_MM_RE = /^(?:([01]\d|2[0-3]):([0-5]\d)|24:00)$/;

export function isValidTimeHHMM(value: string): boolean {
  return HH_MM_RE.test(value);
}

export function isValidIanaTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function getCurrentMinutes(timezone: string, now: Date): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    return hour * 60 + minute;
  } catch {
    return null;
  }
}

export function isInSilentHours(config: PushConfig, now?: Date): boolean {
  const { silentStart, silentEnd, timezone } = config;
  if (!silentStart || !silentEnd || !timezone) return false;
  if (!isValidTimeHHMM(silentStart) || !isValidTimeHHMM(silentEnd)) return false;

  const currentMins = getCurrentMinutes(timezone, now ?? new Date());
  if (currentMins === null) return false;

  const startMins = toMinutes(silentStart);
  const endMins = toMinutes(silentEnd);

  if (startMins <= endMins) {
    return currentMins >= startMins && currentMins < endMins;
  }
  return currentMins >= startMins || currentMins < endMins;
}

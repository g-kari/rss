import type { PushConfig } from "../types";

const HH_MM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

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

export function isInSilentHours(config: PushConfig, now?: Date): boolean {
  const { silentStart, silentEnd, timezone } = config;
  if (!silentStart || !silentEnd || !timezone) return false;
  if (!isValidTimeHHMM(silentStart) || !isValidTimeHHMM(silentEnd)) return false;

  let currentMins: number;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now ?? new Date());
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    currentMins = hour * 60 + minute;
  } catch {
    return false;
  }

  const startMins = toMinutes(silentStart);
  const endMins = toMinutes(silentEnd);

  if (startMins <= endMins) {
    return currentMins >= startMins && currentMins < endMins;
  }
  return currentMins >= startMins || currentMins < endMins;
}

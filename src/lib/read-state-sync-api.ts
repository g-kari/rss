import type { ReadState } from "../types";
import { apiFetch } from "./api-fetch";
import { isReadState } from "./type-guards";
import { devError } from "./dev-log";

export interface SaveResult {
  ok: boolean;
  state?: ReadState;
  status?: number;
}

export async function fetchReadState(): Promise<ReadState | null> {
  try {
    const res = await apiFetch("/api/read-state");
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return isReadState(data) ? data : null;
  } catch (err) {
    devError("[read-state-sync-api] fetchReadState failed", err);
    return null;
  }
}

export async function saveReadState(body: string): Promise<SaveResult> {
  try {
    const res = await apiFetch("/api/read-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!res.ok) return { ok: false, status: res.status };
    const data: unknown = await res.json();
    if (!isReadState(data)) return { ok: false };
    return { ok: true, state: data };
  } catch (err) {
    devError("[read-state-sync-api] saveReadState failed", err);
    return { ok: false };
  }
}

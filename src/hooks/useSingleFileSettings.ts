"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch, tryParseErrorBody } from "../lib/api-fetch";

interface TokenMetadata {
  id: string;
  createdAt: string;
  expiresAt: string;
}
interface State {
  userId: string;
  loaded: boolean;
  metadata: TokenMetadata | null;
  secret: string;
  error: string;
}
const initial = (userId: string): State => ({
  userId,
  loaded: false,
  metadata: null,
  secret: "",
  error: "",
});
function metadata(value: unknown): TokenMetadata | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" &&
    typeof v.createdAt === "string" &&
    typeof v.expiresAt === "string" &&
    Number.isFinite(Date.parse(v.expiresAt))
    ? { id: v.id, createdAt: v.createdAt, expiresAt: v.expiresAt }
    : null;
}

/** Secrets live only in this mounted panel's memory, never browser storage or URLs. */
export function useSingleFileSettings(userId: string, active: boolean) {
  const [state, setState] = useState<State>(() => initial(userId));
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const generation = useRef(0);
  const pending = useRef(false);
  const currentUser = useRef(userId);
  currentUser.current = userId;

  useEffect(() => {
    const sequence = ++generation.current;
    pending.current = false;
    setBusy(false);
    setState(initial(userId));
    if (!active) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await apiFetch("/api/clip/token", {
          headers: { "X-RSS-Account-Id": userId },
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("load");
        const data = (await response.json()) as { token?: unknown };
        if (data.token !== null && !metadata(data.token)) throw new Error("invalid");
        if (sequence === generation.current && currentUser.current === userId)
          setState({ ...initial(userId), loaded: true, metadata: metadata(data.token) });
      } catch {
        if (
          !controller.signal.aborted &&
          sequence === generation.current &&
          currentUser.current === userId
        )
          setState({
            ...initial(userId),
            error: "連携設定を読み込めませんでした。再読み込みしてください。",
          });
      }
    })();
    return () => {
      controller.abort();
      ++generation.current;
    };
  }, [userId, active, reload]);

  async function mutate(method: "POST" | "DELETE") {
    if (pending.current || !active || !state.loaded || state.userId !== userId) return;
    pending.current = true;
    setBusy(true);
    const sequence = generation.current;
    setState((previous) => ({ ...previous, error: "", secret: "" }));
    try {
      const response = await apiFetch("/api/clip/token", {
        method,
        headers: { "X-RSS-Account-Id": userId },
        cache: "no-store",
      });
      if (!response.ok) {
        const data = await tryParseErrorBody(response);
        throw new Error(
          typeof data.error === "string" ? data.error : "連携設定を変更できませんでした",
        );
      }
      const data = (await response.json()) as { token?: unknown };
      const nextMetadata = method === "POST" ? metadata(data) : null;
      if (method === "POST" && (!nextMetadata || typeof data.token !== "string"))
        throw new Error("発行結果を確認できませんでした。再読み込みしてください。");
      if (sequence === generation.current && currentUser.current === userId)
        setState({
          userId,
          loaded: true,
          metadata: nextMetadata,
          secret: typeof data.token === "string" ? data.token : "",
          error: "",
        });
    } catch (error) {
      if (sequence === generation.current && currentUser.current === userId)
        setState((previous) => ({
          ...previous,
          loaded: false,
          secret: "",
          error:
            error instanceof Error
              ? error.message
              : "変更結果を確認できませんでした。再読み込みしてください。",
        }));
    } finally {
      if (sequence === generation.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  return {
    ...(state.userId === userId && active ? state : initial(userId)),
    busy,
    issue: () => mutate("POST"),
    revoke: () => mutate("DELETE"),
    refresh: () => setReload((value) => value + 1),
  };
}

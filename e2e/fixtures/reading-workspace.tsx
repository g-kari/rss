// Full production App and demo API data. No account, persistent browser state or real API access.
import { createRoot } from "react-dom/client";
import App from "../../src/App";
import { installDemoFetch } from "../../app/demo/mock";
import { STORAGE_KEYS } from "../../src/lib/storage";

const params = new URLSearchParams(location.search);
const memory = new Map<string, string>();
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, String(value)),
  removeItem: (key: string) => memory.delete(key),
  clear: () => memory.clear(),
  key: (index: number) => [...memory.keys()][index] ?? null,
  get length() {
    return memory.size;
  },
};
Object.defineProperty(window, "localStorage", { value: storage });
Object.defineProperty(window, "sessionStorage", { value: storage });
storage.setItem(STORAGE_KEYS.THEME, params.get("theme") ?? "light");
storage.setItem(STORAGE_KEYS.SIDEBAR_WIDTH, params.get("sidebar") ?? "240");
storage.setItem(STORAGE_KEYS.LIST_WIDTH, params.get("list") ?? "360");
if (params.get("nsfw") === "1") storage.setItem(STORAGE_KEYS.NSFW_MODE, "1");
installDemoFetch();
const demoFetch = window.fetch;
const tags =
  params.get("stress") === "1" ? Array.from({ length: 20 }, (_, i) => `資料${i + 1}`) : ["設計"];
const collections = Array.from({ length: params.get("stress") === "1" ? 20 : 1 }, (_, i) => ({
  id: `collection-${i + 1}`,
  name: i === 0 ? "学びの資料" : `資料集${i + 1}`,
  articleIds: ["art-1"],
  createdAt: "2026-10-09T00:00:00.000Z",
  order: i,
}));
window.fetch = async (input, init) => {
  const path = String(input);
  const method = init?.method ?? "GET";
  if (params.get("nsfw") === "1" && path === "/api/feeds" && method === "GET") {
    const feeds: unknown = await (await demoFetch(input, init)).json();
    if (!Array.isArray(feeds)) throw new Error("Synthetic feed list must be an array");
    return Response.json(feeds.map((feed) => ({ ...feed, nsfw: true })));
  }
  if (path.includes("/api/collections") && method === "GET") return Response.json(collections);
  if (path.includes("/api/read-state") && method === "GET") {
    const state: unknown = await (await demoFetch(input, init)).json();
    if (typeof state !== "object" || state === null || Array.isArray(state))
      throw new Error("Synthetic read state must be an object");
    return Response.json({ ...state, tagIds: { "art-1": tags } });
  }
  if (path.includes("/api/ogp")) return Response.json({});
  if (path.includes("/api/push/config")) return Response.json({ recommendationEnabled: false });
  return demoFetch(input, init);
};
createRoot(document.getElementById("root")!).render(<App />);

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
installDemoFetch();
const demoFetch = window.fetch;
window.fetch = async (input, init) => {
  const path = String(input);
  const method = init?.method ?? "GET";
  if (path.includes("/api/collections") && method === "GET") return Response.json([]);
  if (path.includes("/api/ogp")) return Response.json({});
  if (path.includes("/api/push/config")) return Response.json({ recommendationEnabled: false });
  return demoFetch(input, init);
};
createRoot(document.getElementById("root")!).render(<App />);

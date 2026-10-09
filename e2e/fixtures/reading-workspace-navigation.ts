// The demo's router stays inside the isolated fixture origin and never enters a signed-in route.
import { useEffect, useMemo, useState } from "react";
const router = {
  replace(url: string) {
    const query = url.includes("?") ? url.slice(url.indexOf("?")) : "";
    history.replaceState(history.state, "", location.pathname + query);
    window.dispatchEvent(new Event("fixture-router-search"));
  },
};
export function useRouter() {
  return router;
}
export function useSearchParams() {
  const [search, setSearch] = useState(location.search);
  useEffect(() => {
    const update = () => setSearch(location.search);
    window.addEventListener("popstate", update);
    window.addEventListener("fixture-router-search", update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener("fixture-router-search", update);
    };
  }, []);
  return useMemo(() => new URLSearchParams(search), [search]);
}

import { dirname, resolve } from "node:path";

/** Match Wrangler CLI's state root, then adapt it to getPlatformProxy's versioned root. */
export function getMaintenanceProxyOptions(configPath, { persistTo, remote = false } = {}) {
  const stateRoot = persistTo
    ? resolve(process.cwd(), persistTo)
    : resolve(dirname(configPath), ".wrangler/state");
  return {
    configPath,
    remoteBindings: remote,
    persist: { path: resolve(stateRoot, "v3") },
  };
}

/** Validation only. The caller must still require explicit operator-approved --remote. */
export function requireRemoteSearchBindings(config) {
  const source = config.r2_buckets?.find((binding) => binding.binding === "RSS_DATA");
  const index = config.d1_databases?.find((binding) => binding.binding === "ARTICLE_SEARCH");
  const databaseId = index?.database_id ?? "";
  if (
    !source?.remote ||
    !index?.remote ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(databaseId) ||
    databaseId === "00000000-0000-0000-0000-000000000000"
  ) {
    throw new Error(
      "Remote maintenance needs explicit remote:true bindings and a real operator-approved D1 database ID",
    );
  }
}

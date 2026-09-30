import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  getMaintenanceProxyOptions,
  requireRemoteSearchBindings,
} from "./search-maintenance-options.mjs";

test("maintenance persistence matches Wrangler's config-relative and explicit state roots", () => {
  const configPath = resolve("nested/config/wrangler.jsonc");
  assert.deepEqual(getMaintenanceProxyOptions(configPath), {
    configPath,
    remoteBindings: false,
    persist: { path: resolve("nested/config/.wrangler/state/v3") },
  });
  assert.deepEqual(getMaintenanceProxyOptions(configPath, { persistTo: "custom-state" }), {
    configPath,
    remoteBindings: false,
    persist: { path: resolve("custom-state/v3") },
  });
});

test("remote bindings need an explicit flag and valid non-dummy D1 configuration", () => {
  const configPath = resolve("wrangler.jsonc");
  assert.equal(getMaintenanceProxyOptions(configPath).remoteBindings, false);
  assert.equal(getMaintenanceProxyOptions(configPath, { remote: true }).remoteBindings, true);
  const valid = {
    r2_buckets: [{ binding: "RSS_DATA", remote: true }],
    d1_databases: [
      {
        binding: "ARTICLE_SEARCH",
        remote: true,
        database_id: "12345678-1234-1234-1234-123456789abc",
      },
    ],
  };
  assert.doesNotThrow(() => requireRemoteSearchBindings(valid));
  for (const config of [
    {},
    { ...valid, r2_buckets: [{ binding: "RSS_DATA", remote: false }] },
    { ...valid, d1_databases: [{ ...valid.d1_databases[0], remote: false }] },
    {
      ...valid,
      d1_databases: [
        { ...valid.d1_databases[0], database_id: "00000000-0000-0000-0000-000000000000" },
      ],
    },
    { ...valid, d1_databases: [{ ...valid.d1_databases[0], database_id: "placeholder" }] },
  ])
    assert.throws(() => requireRemoteSearchBindings(config), /explicit remote:true/);
});

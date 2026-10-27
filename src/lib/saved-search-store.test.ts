import { afterEach, describe, expect, it, vi } from "vitest";
import { createSavedSearchStore, type SavedSearch } from "./saved-search-store";

const entry = (name: string, id = name): SavedSearch => ({
  id,
  name,
  query: `title:${name}`,
  createdAt: "2026-10-18T00:00:00.000Z",
});
function fixture(initial: SavedSearch[] = []) {
  let persisted: readonly SavedSearch[] = structuredClone(initial);
  const write = vi.fn((items: readonly SavedSearch[]) => {
    persisted = structuredClone(items);
    return true;
  });
  const store = createSavedSearchStore(() => structuredClone(persisted), write);
  const unsubscribe = store.subscribe(() => {});
  return { store, write, stored: () => persisted, unsubscribe };
}

describe("shared saved-search snapshot", () => {
  it("notifies both consumers with the same immutable snapshot and leaves input objects untouched", () => {
    const { store } = fixture();
    const one = vi.fn(),
      two = vi.fn();
    store.subscribe(one);
    store.subscribe(two);
    const input = entry("imported");
    const initial = store.getSnapshot();
    expect(store.getSnapshot()).toBe(initial);
    expect(store.importSaved([input])).toBe(true);
    const next = store.getSnapshot();
    expect(next).not.toBe(initial);
    expect(store.getSnapshot()).toBe(next);
    expect(Object.isFrozen(next)).toBe(true);
    expect(Object.isFrozen(next.items)).toBe(true);
    expect(Object.isFrozen(next.items[0])).toBe(true);
    input.name = "mutated input";
    expect(next.items[0].name).toBe("imported");
    expect(one).toHaveBeenCalledTimes(1);
    expect(two).toHaveBeenCalledTimes(1);
  });
  it("callbacks captured before an import always merge the newest snapshot", () => {
    const { store, stored } = fixture([entry("old")]);
    const save = store.save,
      remove = store.removeSaved,
      importSaved = store.importSaved;
    store.importSaved([entry("first")]);
    save("new", "query");
    importSaved([entry("second")]);
    remove("old");
    expect(stored().map((x) => x.name)).toEqual(["second", "new", "first"]);
  });
  it("preserves existing name replacement order and trims explicit save inputs", () => {
    const { store, stored } = fixture([entry("one"), entry("two")]);
    store.save(" one ", " title:updated ");
    expect(stored().map((x) => x.name)).toEqual(["one", "two"]);
    expect(stored()[0].query).toBe("title:updated");
    expect(stored()[0].id).not.toBe("one");
  });
  it("import-first name dedup and twenty-entry limit retain unrelated entries in order", () => {
    const { store, stored } = fixture(Array.from({ length: 20 }, (_, i) => entry(`old${i}`)));
    const imported = [
      entry("old2", "replacement"),
      entry("imported"),
      entry("imported", "duplicate"),
    ];
    store.importSaved(imported);
    expect(stored()).toHaveLength(20);
    expect(
      stored()
        .slice(0, 3)
        .map((x) => x.id),
    ).toEqual(["replacement", "imported", "old0"]);
    expect(stored().filter((x) => x.name === "old2")).toHaveLength(1);
  });
  it("empty explicit saves and absent deletes do not write", () => {
    const { store, write } = fixture([entry("old")]);
    expect(store.save(" ", "q")).toBe(false);
    expect(store.save("n", " ")).toBe(false);
    expect(store.removeSaved("missing")).toBe(true);
    expect(write).not.toHaveBeenCalled();
  });
  it.each(["save", "remove", "import", "clear"])(
    "failed %s retains the same prior items and reports a shared error",
    (operation) => {
      const { store, write, stored } = fixture([entry("old")]);
      const previous = store.getSnapshot().items;
      write.mockReturnValue(false);
      const ok =
        operation === "save"
          ? store.save("new", "q")
          : operation === "remove"
            ? store.removeSaved("old")
            : operation === "import"
              ? store.importSaved([entry("new")])
              : store.clearSaved();
      expect(ok).toBe(false);
      expect(store.getSnapshot().items).toBe(previous);
      expect(store.getSnapshot().error).toContain("保存できません");
      expect(stored()).toEqual([entry("old")]);
      write.mockImplementation((items) => {
        persistedAfterRetry = structuredClone(items);
        return true;
      });
      let persistedAfterRetry: readonly SavedSearch[] = [];
      expect(store.save("retry", "q")).toBe(true);
      expect(store.getSnapshot().error).toBeNull();
      expect(persistedAfterRetry.map((x) => x.name)).toEqual(["retry", "old"]);
    },
  );
  it("an unexpected persistence throw cannot discard a snapshot or reach the UI as a raw error", () => {
    const { store, write } = fixture([entry("old")]);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    write.mockImplementation(() => {
      throw new Error("synthetic storage failure");
    });
    expect(store.importSaved([entry("new")])).toBe(false);
    expect(store.getSnapshot().items[0].name).toBe("old");
    expect(store.getSnapshot().error).not.toContain("synthetic storage");
    log.mockRestore();
  });
  it("last unsubscribe reloads persisted data on later mount without retaining stale cache", () => {
    let data = [entry("before")];
    const store = createSavedSearchStore(
      () => data,
      () => true,
    );
    const off = store.subscribe(() => {});
    expect(store.getSnapshot().items[0].name).toBe("before");
    off();
    data = [entry("after")];
    const off2 = store.subscribe(() => {});
    expect(store.getSnapshot().items[0].name).toBe("after");
    off2();
  });
});

describe("saved-search persistence across tabs", () => {
  it("keeps another tab's saved entry even before its storage event is delivered", () => {
    let persisted: readonly SavedSearch[] = [entry("original")];
    const read = () => structuredClone(persisted);
    const write = (items: readonly SavedSearch[]) => {
      persisted = structuredClone(items);
      return true;
    };
    const first = createSavedSearchStore(read, write);
    const second = createSavedSearchStore(read, write);
    first.subscribe(() => {});
    second.subscribe(() => {});
    first.getSnapshot();
    second.getSnapshot();
    first.save("from-first", "title:first");
    second.save("from-second", "title:second");
    expect(persisted.map((item) => item.name)).toEqual(["from-second", "from-first", "original"]);
  });

  it("does not resurrect an entry removed by another tab", () => {
    let persisted: readonly SavedSearch[] = [entry("original")];
    const read = () => structuredClone(persisted);
    const write = (items: readonly SavedSearch[]) => {
      persisted = structuredClone(items);
      return true;
    };
    const first = createSavedSearchStore(read, write);
    const second = createSavedSearchStore(read, write);
    first.subscribe(() => {});
    second.subscribe(() => {});
    first.getSnapshot();
    second.getSnapshot();
    first.removeSaved("original");
    second.save("from-second", "title:second");
    expect(persisted.map((item) => item.name)).toEqual(["from-second"]);
  });
});

describe("saved-search external notifications", () => {
  it("refreshes both readers once without writing, and unsubscribes only after the final reader", () => {
    let persisted = [entry("initial")];
    let external: (() => void) | undefined;
    const stop = vi.fn();
    const start = vi.fn((listener: () => void) => {
      external = listener;
      return stop;
    });
    const write = vi.fn(() => true);
    const store = createSavedSearchStore(() => structuredClone(persisted), write, start);
    const first = vi.fn(),
      second = vi.fn();
    const off1 = store.subscribe(first),
      off2 = store.subscribe(second);
    first.mockClear();
    second.mockClear();
    expect(start).toHaveBeenCalledTimes(1);
    persisted = [entry("external"), entry("initial")];
    external!();
    const changed = store.getSnapshot();
    expect(changed.items.map((item) => item.name)).toEqual(["external", "initial"]);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    external!();
    external!();
    expect(store.getSnapshot()).toBe(changed);
    expect(first).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();
    off1();
    expect(stop).not.toHaveBeenCalled();
    off2();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it.each(["save", "remove", "import", "clear"])(
    "refuses %s on a failed fresh read without replacing known items",
    (operation) => {
      const read = vi.fn(() => [entry("known")]);
      const write = vi.fn(() => true);
      const store = createSavedSearchStore(read, write, () => () => {});
      const off = store.subscribe(() => {});
      const before = store.getSnapshot().items;
      read.mockImplementation(() => {
        throw new Error("synthetic read error");
      });
      const ok =
        operation === "save"
          ? store.save("new", "q")
          : operation === "remove"
            ? store.removeSaved("known")
            : operation === "import"
              ? store.importSaved([entry("imported")])
              : store.clearSaved();
      expect(ok).toBe(false);
      expect(store.getSnapshot().items).toBe(before);
      expect(store.getSnapshot().error).toContain("上書きはしていません");
      expect(store.getSnapshot().error).not.toContain("synthetic");
      expect(write).not.toHaveBeenCalled();
      read.mockReturnValue([entry("external"), entry("known")]);
      expect(store.save("retry", "q")).toBe(true);
      expect(store.getSnapshot().items.map((item) => item.name)).toEqual([
        "retry",
        "external",
        "known",
      ]);
      expect(store.getSnapshot().error).toBeNull();
      off();
    },
  );

  it("keeps a failed write visible after an external refresh without claiming save success", () => {
    let external: (() => void) | undefined;
    let persisted = [entry("initial")];
    const store = createSavedSearchStore(
      () => persisted,
      () => false,
      (listener) => {
        external = listener;
        return () => {};
      },
    );
    const off = store.subscribe(() => {});
    expect(store.save("failed", "q")).toBe(false);
    persisted = [entry("other")];
    external!();
    expect(store.getSnapshot().items).toEqual(persisted);
    expect(store.getSnapshot().error).toContain("保存できません");
    off();
  });

  it("reads persisted updates after a subscribe gap and does not resurrect external removals on import", () => {
    let persisted: readonly SavedSearch[] = [entry("initial")];
    const write = vi.fn((items: readonly SavedSearch[]) => {
      persisted = items;
      return true;
    });
    const store = createSavedSearchStore(
      () => persisted,
      write,
      () => () => {},
    );
    expect(store.getSnapshot().items[0].name).toBe("initial");
    persisted = [entry("external")];
    const off = store.subscribe(() => {});
    expect(store.getSnapshot().items[0].name).toBe("external");
    persisted = [];
    expect(store.importSaved([entry("imported")])).toBe(true);
    expect(persisted.map((item) => item.name)).toEqual(["imported"]);
    off();
  });
});

describe("saved-search browser storage boundary", () => {
  const offs: (() => void)[] = [];
  afterEach(() => {
    for (const off of offs.splice(0)) off();
    vi.restoreAllMocks();
    localStorage.removeItem("rss-saved-searches");
  });
  const storageEvent = (
    key: string | null,
    storageArea: Storage = localStorage,
    newValue = "stale-event",
  ) => window.dispatchEvent(new StorageEvent("storage", { key, storageArea, newValue }));

  it("uses the current stored value rather than a stale event, ignoring other keys and session storage", () => {
    localStorage.setItem("rss-saved-searches", JSON.stringify([entry("first")]));
    const store = createSavedSearchStore();
    const listener = vi.fn();
    offs.push(store.subscribe(listener));
    listener.mockClear();
    localStorage.setItem("rss-saved-searches", JSON.stringify([entry("newest")]));
    storageEvent("rss-search-history");
    storageEvent("rss-saved-searches", sessionStorage);
    expect(store.getSnapshot().items[0].name).toBe("first");
    storageEvent("rss-saved-searches");
    expect(store.getSnapshot().items[0].name).toBe("newest");
    expect(listener).toHaveBeenCalledTimes(1);
    storageEvent("rss-saved-searches");
    expect(listener).toHaveBeenCalledTimes(1);
    localStorage.removeItem("rss-saved-searches");
    storageEvent(null);
    expect(store.getSnapshot().items).toEqual([]);
  });

  it.each(["invalid-json", "null", "{}", '[{"name":"partial"}]'])(
    "preserves malformed stored data %s on event and mutation",
    (raw) => {
      localStorage.setItem("rss-saved-searches", JSON.stringify([entry("known")]));
      const store = createSavedSearchStore();
      offs.push(store.subscribe(() => {}));
      const before = store.getSnapshot().items;
      localStorage.setItem("rss-saved-searches", raw);
      storageEvent("rss-saved-searches");
      expect(store.getSnapshot().items).toBe(before);
      expect(store.save("new", "q")).toBe(false);
      expect(localStorage.getItem("rss-saved-searches")).toBe(raw);
      expect(store.getSnapshot().error).toContain("上書きはしていません");
    },
  );

  it("still displays valid legacy entries from a mixed list but does not rewrite unrecognized entries", () => {
    const raw = JSON.stringify([entry("legacy"), { name: "incomplete" }]);
    localStorage.setItem("rss-saved-searches", raw);
    const store = createSavedSearchStore();
    offs.push(store.subscribe(() => {}));
    expect(store.getSnapshot().items).toEqual([entry("legacy")]);
    expect(store.getSnapshot().error).toContain("上書きはしていません");
    expect(store.save("new", "q")).toBe(false);
    expect(localStorage.getItem("rss-saved-searches")).toBe(raw);
  });

  it("does not interpret a denied read as an empty list even if writes remain possible", () => {
    localStorage.setItem("rss-saved-searches", JSON.stringify([entry("known")]));
    const store = createSavedSearchStore();
    offs.push(store.subscribe(() => {}));
    const before = store.getSnapshot().items;
    const get = vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("synthetic denial");
    });
    const set = vi.spyOn(localStorage, "setItem");
    storageEvent("rss-saved-searches");
    expect(store.save("new", "q")).toBe(false);
    expect(store.getSnapshot().items).toBe(before);
    expect(set).not.toHaveBeenCalled();
    get.mockRestore();
    expect(JSON.parse(localStorage.getItem("rss-saved-searches")!)).toEqual([entry("known")]);
    expect(store.save("retry", "q")).toBe(true);
  });
});

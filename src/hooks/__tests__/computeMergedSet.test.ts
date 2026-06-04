import { describe, it, expect } from "vitest";
import { computeMergedSet } from "../useReadStateSyncApply";

/**
 * computeMergedSet 純粋関数の spec。
 *
 * R2 サーバー同期時にローカル Set にサーバー値をマージするが、まだ flush されていない
 * ローカル削除 (`pendingRemoved`) を honor せずに union すると、削除が同期往復で復活する
 * data resurrection が起きる (correctness 監査 finding、tags channel との非対称)。
 * `pendingRemoved` に含まれる id は server 値からも除外することを固定する。
 */
describe("computeMergedSet", () => {
  it("サーバーに新規 id があれば local ∪ server を返す", () => {
    const merged = computeMergedSet(new Set(["a"]), ["a", "b"]);
    expect(merged).not.toBeNull();
    expect([...merged!].sort()).toEqual(["a", "b"]);
  });

  it("変更がなければ null を返す (setState skip 用)", () => {
    expect(computeMergedSet(new Set(["a", "b"]), ["a", "b"])).toBeNull();
    expect(computeMergedSet(new Set(["a"]), [])).toBeNull();
  });

  it("local が既に持つ id は重複しない", () => {
    expect(computeMergedSet(new Set(["a", "b"]), ["a"])).toBeNull();
  });

  it("pendingRemoved の id はサーバーに残っていても merged に含めない (resurrection 防止)", () => {
    // ローカルで a を削除済 (pendingRemoved=[a]) だがサーバーはまだ a を返してくる
    const merged = computeMergedSet(new Set<string>(), ["a"], new Set(["a"]));
    expect(merged).toBeNull(); // a だけが新規でそれが suppress されるので変更なし → null
  });

  it("pendingRemoved 対象外のサーバー新規 id は通常通り取り込む", () => {
    const merged = computeMergedSet(new Set<string>(), ["a", "b"], new Set(["a"]));
    expect(merged).not.toBeNull();
    expect([...merged!]).toEqual(["b"]); // a は suppress、b は取り込む
  });

  it("pendingRemoved 未指定 (undefined) は従来挙動 (suppress なし)", () => {
    const merged = computeMergedSet(new Set<string>(), ["a"], undefined);
    expect(merged).not.toBeNull();
    expect([...merged!]).toEqual(["a"]);
  });

  it("pendingRemoved 空 Set でも従来挙動", () => {
    const merged = computeMergedSet(new Set<string>(), ["a"], new Set());
    expect([...merged!]).toEqual(["a"]);
  });
});

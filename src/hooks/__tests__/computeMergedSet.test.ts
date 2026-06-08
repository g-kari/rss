import { describe, it, expect } from "vitest";
import { computeMergedSet, computeMergedNotes } from "../useReadStateSyncApply";

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

/**
 * computeMergedNotes 純粋関数の spec (#1113)。
 *
 * notes の server-wins マージで、まだ flush されていないローカル変更を server 値から守る:
 * - pendingChanged: flush の await 中に再編集された note が古い server 値に巻き戻るのを防ぐ
 *   (tags channel の pendingTagChangedRef と対称)
 * - pendingRemoved: 削除した note が server 往復で復活するのを防ぐ (#1084)
 */
describe("computeMergedNotes", () => {
  it("server-wins: 同 key は server 値で上書きされる (pending 保護なし)", () => {
    const merged = computeMergedNotes({ a: "local" }, { a: "server" }, new Set(), new Set());
    expect(merged).toEqual({ a: "server" });
  });

  it("local ∪ server: 双方の key を含む", () => {
    const merged = computeMergedNotes({ a: "la" }, { b: "sb" }, new Set(), new Set());
    expect(merged).toEqual({ a: "la", b: "sb" });
  });

  it("pendingChanged の key は server 値で上書きされず local 値を保持 (#1113 編集巻き戻り防止)", () => {
    // flush await 中に a を "v2" に再編集 → pendingChanged=[a]、server は古い "v1" を返す
    const merged = computeMergedNotes({ a: "v2" }, { a: "v1" }, new Set(), new Set(["a"]));
    expect(merged).toEqual({ a: "v2" }); // local 編集 "v2" が保持される (旧実装では "v1" に巻き戻り)
  });

  it("pendingRemoved の key は local/server 双方から除外 (#1084 resurrection 防止)", () => {
    const merged = computeMergedNotes({ a: "la" }, { a: "sa", b: "sb" }, new Set(["a"]), new Set());
    expect(merged).toEqual({ b: "sb" }); // a は削除中なので含めない
  });

  it("pendingRemoved は pendingChanged より優先 (削除が編集に勝つ)", () => {
    const merged = computeMergedNotes({ a: "la" }, { a: "sa" }, new Set(["a"]), new Set(["a"]));
    expect(merged).toEqual({}); // removed が優先で a は除外
  });

  it("pending 両方空なら通常の server-wins union", () => {
    const merged = computeMergedNotes(
      { a: "la", b: "lb" },
      { b: "sb", c: "sc" },
      new Set(),
      new Set(),
    );
    expect(merged).toEqual({ a: "la", b: "sb", c: "sc" });
  });
});

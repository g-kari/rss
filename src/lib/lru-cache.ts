/**
 * Map ベースの LRU キャッシュ
 *
 * セッション中はメモリ (Map) から O(1) で読み書きし、
 * localStorage には永続化のみ使用する。
 * Map はキーの挿入順を保持するため、先頭が最も古いエントリになる。
 *
 * localStorage への書き込みは非同期バッファリングする。
 * set() が呼ばれるたびに即座に書き込むのではなく、queueMicrotask で
 * まとめてフラッシュする。setTimeout(..., 0) のマクロタスク遅延（最低 4ms）を
 * 避けてより速くフラッシュしつつ、連続した set() 呼び出しの I/O を削減する。
 */
import { STORAGE_KEYS, storageGet, storageSet, storageRemove, storageListKeys } from "./storage";

export class LruCache {
  private readonly map = new Map<string, string>();
  private hydrated = false;
  /** フラッシュ待ちの書き込み。値が null の場合は削除操作 */
  private readonly pending = new Map<string, string | null>();
  private flushPending = false;

  constructor(
    private readonly prefix: string,
    private readonly maxSize: number,
  ) {}

  /** localStorage から初回読み込み（遅延初期化） */
  private hydrate(): void {
    if (this.hydrated) return;
    this.hydrated = true;
    for (const key of storageListKeys(this.prefix)) {
      const value = storageGet(key);
      if (value !== null) {
        this.map.set(key.slice(this.prefix.length), value);
      }
    }
  }

  /**
   * キャッシュからエントリを取得する。
   * アクセスされたエントリを末尾に移動して「最近使用済み」として扱う（LRU 更新）。
   *
   * @param id - キャッシュキー
   * @returns キャッシュされた値。存在しない場合は null
   */
  get(id: string): string | null {
    this.hydrate();
    const value = this.map.get(id);
    if (value === undefined) return null;
    // LRU: アクセスされたエントリを末尾に移動して「最近使用済み」にする。
    // これをしないと挿入順の FIFO になり、頻繁にアクセスする記事が
    // 古いだけで evict されてしまう。
    this.map.delete(id);
    this.map.set(id, value);
    return value;
  }

  /**
   * キャッシュにエントリを追加・更新する。
   * キャッシュが maxSize に達している場合は最も古いエントリを削除してから挿入する。
   * localStorage への書き込みはマイクロタスクで非同期にフラッシュする。
   *
   * @param id - キャッシュキー
   * @param value - キャッシュする値
   */
  set(id: string, value: string): void {
    this.hydrate();
    // 既存エントリを削除して末尾に再挿入 → Map の先頭が最古エントリ
    this.map.delete(id);
    if (this.map.size >= this.maxSize) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
        this.pending.set(oldestKey, null); // 削除を予約
      }
    }
    this.map.set(id, value);
    this.pending.set(id, value); // 書き込みを予約
    this.scheduleFlush();
  }

  /** マイクロタスクで pending をフラッシュするようスケジュール */
  private scheduleFlush(): void {
    if (this.flushPending) return;
    this.flushPending = true;
    queueMicrotask(() => this.flush());
  }

  /** pending を一括で localStorage に書き込む */
  private flush(): void {
    this.flushPending = false;
    for (const [key, value] of this.pending) {
      if (value === null) {
        storageRemove(this.prefix + key);
      } else {
        storageSet(this.prefix + key, value);
      }
    }
    this.pending.clear();
  }
}

/** 記事全文キャッシュ（最大 15 件） */
export const contentLruCache = new LruCache(STORAGE_KEYS.CONTENT_CACHE_PREFIX, 15);

/** AI 結果キャッシュ（最大 30 件） */
export const aiLruCache = new LruCache(STORAGE_KEYS.AI_CACHE_PREFIX, 30);

/** AI 翻訳キャッシュ（最大 30 件） */
export const aiTranslateLruCache = new LruCache(STORAGE_KEYS.AI_TRANSLATE_CACHE_PREFIX, 30);

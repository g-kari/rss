/**
 * Map ベースの LRU キャッシュ
 *
 * セッション中はメモリ (Map) から O(1) で読み書きし、
 * localStorage には永続化のみ使用する。
 * Map はキーの挿入順を保持するため、先頭が最も古いエントリになる。
 */
class LruCache {
  private readonly map = new Map<string, string>();
  private hydrated = false;

  constructor(
    private readonly prefix: string,
    private readonly maxSize: number,
  ) {}

  /** localStorage から初回読み込み（遅延初期化） */
  private hydrate(): void {
    if (this.hydrated) return;
    this.hydrated = true;
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith(this.prefix));
      for (const key of keys) {
        const value = localStorage.getItem(key);
        if (value !== null) {
          this.map.set(key.slice(this.prefix.length), value);
        }
      }
    } catch {
      /* localStorage 利用不可 */
    }
  }

  get(id: string): string | null {
    this.hydrate();
    return this.map.get(id) ?? null;
  }

  set(id: string, value: string): void {
    this.hydrate();
    // 既存エントリを削除して末尾に再挿入 → Map の先頭が最古エントリ
    this.map.delete(id);
    if (this.map.size >= this.maxSize) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
        try {
          localStorage.removeItem(this.prefix + oldestKey);
        } catch {
          /* ignore */
        }
      }
    }
    this.map.set(id, value);
    try {
      localStorage.setItem(this.prefix + id, value);
    } catch {
      /* storage full — 無視 */
    }
  }
}

import { STORAGE_KEYS } from './storage';

/** 記事全文キャッシュ（最大 15 件） */
export const contentLruCache = new LruCache(STORAGE_KEYS.CONTENT_CACHE_PREFIX, 15);

/** AI 結果キャッシュ（最大 30 件） */
export const aiLruCache = new LruCache(STORAGE_KEYS.AI_CACHE_PREFIX, 30);

import type { Feed } from '../types';

export async function listFeeds(db: D1Database): Promise<Feed[]> {
  const result = await db.prepare('SELECT * FROM feeds ORDER BY created_at DESC').all<Feed>();
  return result.results;
}

export async function getFeedById(db: D1Database, id: string): Promise<Feed | null> {
  return db.prepare('SELECT * FROM feeds WHERE id = ?').bind(id).first<Feed>();
}

export async function insertFeed(
  db: D1Database,
  feed: Pick<Feed, 'id' | 'url' | 'title' | 'site_url'>
): Promise<void> {
  await db
    .prepare('INSERT INTO feeds (id, url, title, site_url) VALUES (?, ?, ?, ?)')
    .bind(feed.id, feed.url, feed.title, feed.site_url)
    .run();
}

export async function deleteFeed(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM feeds WHERE id = ?').bind(id).run();
}

export async function updateFeedMeta(
  db: D1Database,
  id: string,
  meta: { title: string; siteUrl: string }
): Promise<void> {
  await db
    .prepare(
      'UPDATE feeds SET title = ?, site_url = ?, last_fetched_at = datetime("now"), error_count = 0 WHERE id = ?'
    )
    .bind(meta.title, meta.siteUrl, id)
    .run();
}

export async function incrementFeedError(db: D1Database, id: string): Promise<void> {
  await db
    .prepare('UPDATE feeds SET error_count = error_count + 1 WHERE id = ?')
    .bind(id)
    .run();
}

import type { Article } from '../types';

export async function listArticles(
  db: D1Database,
  opts: { feedId?: string; page: number; limit: number; unreadOnly: boolean }
): Promise<Article[]> {
  const offset = (opts.page - 1) * opts.limit;
  const feedFilter = opts.feedId ? 'AND a.feed_id = ?' : '';
  const unreadFilter = opts.unreadOnly ? 'AND r.article_id IS NULL' : '';

  const query = `
    SELECT a.*, CASE WHEN r.article_id IS NOT NULL THEN 1 ELSE 0 END as is_read
    FROM articles a
    LEFT JOIN read_items r ON a.id = r.article_id
    WHERE 1=1 ${feedFilter} ${unreadFilter}
    ORDER BY a.published_at DESC
    LIMIT ? OFFSET ?
  `;

  const params: (string | number)[] = [];
  if (opts.feedId) params.push(opts.feedId);
  params.push(opts.limit, offset);

  const result = await db.prepare(query).bind(...params).all<Article>();
  return result.results;
}

export async function insertArticles(
  db: D1Database,
  articles: Array<Omit<Article, 'is_read' | 'created_at'>>
): Promise<void> {
  if (articles.length === 0) return;
  const stmts = articles.map((a) =>
    db
      .prepare(
        'INSERT OR IGNORE INTO articles (id, feed_id, guid, title, link, summary, published_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(a.id, a.feed_id, a.guid, a.title, a.link, a.summary, a.published_at)
  );
  await db.batch(stmts);
}

export async function markRead(db: D1Database, articleId: string): Promise<void> {
  await db
    .prepare('INSERT OR IGNORE INTO read_items (article_id) VALUES (?)')
    .bind(articleId)
    .run();
}

export async function markUnread(db: D1Database, articleId: string): Promise<void> {
  await db.prepare('DELETE FROM read_items WHERE article_id = ?').bind(articleId).run();
}

export async function getUnreadCount(db: D1Database, feedId?: string): Promise<number> {
  const query = feedId
    ? 'SELECT COUNT(*) as count FROM articles a LEFT JOIN read_items r ON a.id = r.article_id WHERE a.feed_id = ? AND r.article_id IS NULL'
    : 'SELECT COUNT(*) as count FROM articles a LEFT JOIN read_items r ON a.id = r.article_id WHERE r.article_id IS NULL';
  const result = await db
    .prepare(query)
    .bind(...(feedId ? [feedId] : []))
    .first<{ count: number }>();
  return result?.count ?? 0;
}

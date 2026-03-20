CREATE TABLE IF NOT EXISTS feeds (
  id TEXT PRIMARY KEY,
  url TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  site_url TEXT NOT NULL DEFAULT '',
  last_fetched_at TEXT,
  error_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  feed_id TEXT NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  guid TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(feed_id, guid)
);

CREATE TABLE IF NOT EXISTS read_items (
  article_id TEXT PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
  read_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_articles_feed_id ON articles(feed_id);
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_feed_published ON articles(feed_id, published_at DESC);

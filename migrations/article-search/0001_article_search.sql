-- Separate migration directory: migrations/0001_initial.sql is the retired primary database.
-- D1 is a disposable search projection. R2 remains authoritative.
CREATE TABLE article_search_feeds (
  feed_hash TEXT PRIMARY KEY,
  source_revision TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('building', 'ready', 'failed')),
  token TEXT NOT NULL,
  title TEXT NOT NULL
);

CREATE TABLE article_search_articles (
  id INTEGER PRIMARY KEY,
  feed_hash TEXT NOT NULL,
  object_key TEXT NOT NULL,
  priority INTEGER NOT NULL,
  article_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  sort_key TEXT NOT NULL,
  fields TEXT NOT NULL,
  search_text TEXT NOT NULL,
  UNIQUE(feed_hash, object_key, article_id)
);
CREATE INDEX article_search_by_id ON article_search_articles(article_id, feed_hash, priority, ordinal);
CREATE INDEX article_search_by_object ON article_search_articles(feed_hash, object_key);
CREATE INDEX article_search_by_date ON article_search_articles(sort_key DESC, article_id);

-- JS lowercases before storage/query; do not introduce SQLite/Unicode case folding.
-- unicode61 is word-based and cannot preserve Japanese/arbitrary substring matching.
CREATE VIRTUAL TABLE article_search_fts USING fts5(
  search_text, content='article_search_articles', content_rowid='id',
  tokenize='trigram case_sensitive 1'
);
CREATE TRIGGER article_search_insert AFTER INSERT ON article_search_articles BEGIN
  INSERT INTO article_search_fts(rowid, search_text) VALUES (new.id, new.search_text);
END;
CREATE TRIGGER article_search_delete AFTER DELETE ON article_search_articles BEGIN
  INSERT INTO article_search_fts(article_search_fts, rowid, search_text)
  VALUES ('delete', old.id, old.search_text);
END;
CREATE TRIGGER article_search_update AFTER UPDATE ON article_search_articles BEGIN
  INSERT INTO article_search_fts(article_search_fts, rowid, search_text)
  VALUES ('delete', old.id, old.search_text);
  INSERT INTO article_search_fts(rowid, search_text) VALUES (new.id, new.search_text);
END;

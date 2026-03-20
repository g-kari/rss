export interface Feed {
  id: string;
  url: string;
  title: string;
  site_url: string;
  last_fetched_at: string | null;
  error_count: number;
  created_at: string;
  unread_count?: number;
}

export interface Article {
  id: string;
  feed_id: string;
  guid: string;
  title: string;
  link: string;
  summary: string;
  published_at: string | null;
  created_at: string;
  is_read?: boolean | number;
}

export interface Env {
  DB: D1Database;
}

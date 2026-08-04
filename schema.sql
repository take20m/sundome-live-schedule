-- sundome-reminder D1 schema
-- 適用: wrangler d1 execute sundome-reminder --file=schema.sql

CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,          -- 'ev-<日付>'(単一ホール前提。表記ゆれによる重複防止)
  title       TEXT NOT NULL,
  artist      TEXT NOT NULL,
  date        TEXT NOT NULL,             -- 公演日 (YYYY-MM-DD)
  open_time   TEXT,                      -- 開場 (HH:MM)
  start_time  TEXT,                      -- 開演 (HH:MM)
  source_url  TEXT,
  confidence  TEXT NOT NULL DEFAULT 'inferred' CHECK (confidence IN ('official', 'inferred')),
  updated_at  TEXT NOT NULL              -- ISO 8601
);

CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);

CREATE TABLE IF NOT EXISTS lotteries (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,             -- FC先行 / プレリク先行 / 一般発売 等
  starts_at   TEXT,                      -- 受付開始 (ISO 8601)
  ends_at     TEXT,                      -- 受付終了 (ISO 8601)
  url         TEXT,
  confidence  TEXT NOT NULL DEFAULT 'inferred' CHECK (confidence IN ('official', 'inferred')),
  sold_out    INTEGER NOT NULL DEFAULT 0,  -- 先着販売の予定枚数終了など(期間内でも受付不可)
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lotteries_event ON lotteries(event_id);
CREATE INDEX IF NOT EXISTS idx_lotteries_period ON lotteries(starts_at, ends_at);

-- 差分検知: 項目(イベント/抽選)ごとの内容ハッシュを保持し、
-- 変化した項目のみ changes に記録して RSS へ流す
CREATE TABLE IF NOT EXISTS snapshots (
  item_id     TEXT PRIMARY KEY,          -- events.id または lotteries.id
  item_type   TEXT NOT NULL CHECK (item_type IN ('event', 'lottery')),
  hash        TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS changes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id     TEXT NOT NULL,
  item_type   TEXT NOT NULL CHECK (item_type IN ('event', 'lottery')),
  change_kind TEXT NOT NULL CHECK (change_kind IN ('added', 'updated')),
  summary     TEXT NOT NULL,             -- RSSに載せる一行サマリ
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_changes_created ON changes(created_at DESC);

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
  artist_url  TEXT,                      -- アーティスト公式サイト(誰の公演か調べる導線)
  tour_url    TEXT,                      -- アーティスト側のその公演・ツアーのページ(「コンサート情報」の飛び先)
  image_url   TEXT,                      -- tour_url ページの og:image(直リンク表示。自前保存はしない)
  image_manual INTEGER NOT NULL DEFAULT 0, -- 1 = 人が判断した画像(「画像なし」も含む)。og:image の取り直し(REFETCH_ALL)で上書きしない
  image_focus  TEXT,                     -- 一覧の正方形サムネに切り出すときの中心(CSS object-position。例 "50% 30%")。画像は保存せず位置だけ持つ
  image_fit    TEXT,                     -- サムネの見せ方: cover(切る) / contain(全体を縮めて収める)。未設定は cover
  image_bg     TEXT,                     -- contain のときの余白の色(#RRGGBB)。無地の背景のロゴ画像で継ぎ目を見せない
  image_zoom   REAL,                     -- 拡大率(1〜3)。上下の黒帯を枠の外へ追い出すなど。中心は image_focus
  tour_manual  INTEGER NOT NULL DEFAULT 0, -- 1 = 人が調べたツアーページ。ingest の収集結果で上書きしない
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
  missed_count INTEGER NOT NULL DEFAULT 0, -- 連続して収集結果に現れなかった回数(1回の見落としで消さないため)
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

-- メール購読(docs/email-digest.md)。確認リンクのトークンはハッシュだけを持つ。
-- 停止用トークンは毎回のメールに載せるのでそのまま持つ(漏れても、できるのはその人の配信停止だけ)
CREATE TABLE IF NOT EXISTS subscribers (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  email                  TEXT NOT NULL UNIQUE,
  status                 TEXT NOT NULL CHECK (status IN ('pending', 'active')),
  confirm_token_hash     TEXT,
  confirm_expires_at     TEXT,
  unsubscribe_token      TEXT NOT NULL UNIQUE,
  created_at             TEXT NOT NULL,
  confirmed_at           TEXT
);

-- 前回のまとめメールに入れた最後の changes.id(1 行だけ)
CREATE TABLE IF NOT EXISTS digest_state (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  last_change_id  INTEGER NOT NULL,
  updated_at      TEXT NOT NULL
);

-- プッシュ通知の宛先(docs/web-push.md)。ブラウザのプッシュサービスが発行した URL と暗号鍵だけを持つ
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  fail_count  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

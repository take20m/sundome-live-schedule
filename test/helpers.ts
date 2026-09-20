import schema from '../schema.sql?raw'

export async function applySchema(db: D1Database): Promise<void> {
  const statements = schema
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.replace(/--[^\n]*/g, '').trim().length > 0)
  for (const stmt of statements) {
    await db.prepare(stmt).run()
  }
}

/** 現在時刻から相対的な日付のサンプルデータを投入する */
export async function seedSample(db: D1Database, now: Date = new Date()): Promise<void> {
  const day = 24 * 60 * 60 * 1000
  const eventDate = new Date(now.getTime() + 30 * day).toISOString().slice(0, 10)
  const nowIso = now.toISOString()

  await db
    .prepare(
      `INSERT INTO events (id, title, artist, date, open_time, start_time, source_url, artist_url, tour_url, confidence, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      `ev-${eventDate}`,
      'SAMPLE ARTIST LIVE TOUR 2026 "HELLO"',
      'SAMPLE ARTIST',
      eventDate,
      '17:00',
      '18:00',
      'https://example.com/tour',
      'https://example.com/artist',
      'https://example.com/artist/live/hello2026',
      'official',
      nowIso,
    )
    .run()

  // 受付中の抽選
  await db
    .prepare(
      `INSERT INTO lotteries (id, event_id, name, starts_at, ends_at, url, confidence, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      `lot-ev-${eventDate}-deadbeef`,
      `ev-${eventDate}`,
      'オフィシャル先行(抽選)',
      new Date(now.getTime() - 1 * day).toISOString(),
      new Date(now.getTime() + 3 * day).toISOString(),
      'https://example.com/lottery',
      'inferred',
      nowIso,
    )
    .run()

  await db
    .prepare(
      `INSERT INTO changes (item_id, item_type, change_kind, summary, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(`ev-${eventDate}`, 'event', 'added', '新規公演: SAMPLE ARTIST LIVE TOUR 2026', nowIso)
    .run()
}

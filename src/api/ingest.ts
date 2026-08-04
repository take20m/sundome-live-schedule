import type { Context } from 'hono'
import { todayInJst } from '../lib/db'
import { formatJst } from '../lib/format'
import type { Bindings, Confidence, LotteryRow } from '../types'

type IncomingLottery = {
  name: string
  starts_at: string | null
  ends_at: string | null
  url: string | null
  confidence: Confidence
}

type IncomingEvent = {
  title: string
  artist: string
  date: string
  open_time: string | null
  start_time: string | null
  source_url: string | null
  confidence: Confidence
  lotteries: IncomingLottery[]
}

type Counts = { added: number; updated: number; unchanged: number }

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** LLM出力の表記ゆれ(全角/半角・空白・大文字小文字)をID計算前に吸収する */
function normalizeKey(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
}

const isConfidence = (v: unknown): v is Confidence => v === 'official' || v === 'inferred'
const isDateStr = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const isTimeOrNull = (v: unknown): v is string | null =>
  v == null || (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v))
const isIsoOrNull = (v: unknown): v is string | null =>
  v == null || (typeof v === 'string' && !Number.isNaN(Date.parse(v)))
const isUrlOrNull = (v: unknown): v is string | null =>
  v == null || (typeof v === 'string' && /^https?:\/\//.test(v))
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

/** 不正な項目は捨てる(SPEC: 誤表示より欠落を優先)。捨てた理由は skipped に積む */
function sanitize(raw: unknown, skipped: string[]): IncomingEvent[] {
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { events?: unknown }).events)) {
    throw new Error('body must be {"events": [...]}')
  }
  const out: IncomingEvent[] = []
  for (const [i, e] of ((raw as { events: unknown[] }).events).entries()) {
    const ev = e as Record<string, unknown>
    if (!nonEmpty(ev.title) || !nonEmpty(ev.artist) || !isDateStr(ev.date)) {
      skipped.push(`events[${i}]: title/artist/date が不正`)
      continue
    }
    if (!isTimeOrNull(ev.open_time ?? null) || !isTimeOrNull(ev.start_time ?? null)) {
      skipped.push(`events[${i}]: 開場/開演時刻が不正`)
      continue
    }
    const lotteries: IncomingLottery[] = []
    for (const [j, l] of (Array.isArray(ev.lotteries) ? ev.lotteries : []).entries()) {
      const lo = l as Record<string, unknown>
      if (!nonEmpty(lo.name)) {
        skipped.push(`events[${i}].lotteries[${j}]: name が不正`)
        continue
      }
      if (!isIsoOrNull(lo.starts_at ?? null) || !isIsoOrNull(lo.ends_at ?? null)) {
        skipped.push(`events[${i}].lotteries[${j}]: 期間が不正`)
        continue
      }
      lotteries.push({
        name: lo.name.trim(),
        starts_at: (lo.starts_at as string | null) ?? null,
        ends_at: (lo.ends_at as string | null) ?? null,
        url: isUrlOrNull(lo.url ?? null) ? ((lo.url as string | null) ?? null) : null,
        confidence: isConfidence(lo.confidence) ? lo.confidence : 'inferred',
      })
    }
    out.push({
      title: ev.title.trim(),
      artist: ev.artist.trim(),
      date: ev.date,
      open_time: (ev.open_time as string | null) ?? null,
      start_time: (ev.start_time as string | null) ?? null,
      source_url: isUrlOrNull(ev.source_url ?? null) ? ((ev.source_url as string | null) ?? null) : null,
      confidence: isConfidence(ev.confidence) ? ev.confidence : 'inferred',
      lotteries,
    })
  }
  return out
}

function lotterySummary(artist: string, l: IncomingLottery, kind: 'added' | 'updated'): string {
  const period =
    l.starts_at || l.ends_at ? `${formatJst(l.starts_at)}〜${formatJst(l.ends_at)}` : '期間未確認'
  return kind === 'added'
    ? `抽選情報: ${artist}「${l.name}」受付 ${period}`
    : `抽選更新: ${artist}「${l.name}」受付 ${period}`
}

type UpsertResult = 'added' | 'updated' | 'unchanged'

/** ISO文字列の表記ゆれ(+09:00 vs Z等)を吸収して同時刻か判定 */
function sameInstant(a: string | null, b: string | null): boolean {
  if (a == null || b == null) return a === b
  return Date.parse(a) === Date.parse(b)
}

/**
 * snapshots のハッシュと比較し、差分があるときだけ書き込み+changes 追加のステートメントを返す。
 * - notify=false: 書き込みはするが通知(changes)には載せない(締切済みの受付など)
 * - seenSummaries: 同一リクエスト内の同文通知を1回に抑える(同ツアー複数公演日の重複対策)
 * - ハッシュは 'v2:' プレフィックス付き。旧形式からの移行時は差分があっても通知しない
 *   (ハッシュ仕様変更による偽の「更新」を一晩分のRSSに流さないため)
 */
async function diffAndUpsert(
  db: D1Database,
  itemId: string,
  itemType: 'event' | 'lottery',
  contentHash: string,
  summaryOf: (kind: 'added' | 'updated') => string,
  upsertStmt: D1PreparedStatement,
  nowIso: string,
  batch: D1PreparedStatement[],
  notify: boolean,
  seenSummaries: Set<string>,
): Promise<UpsertResult> {
  const existing = await db
    .prepare('SELECT hash FROM snapshots WHERE item_id = ?')
    .bind(itemId)
    .first<{ hash: string }>()
  if (existing?.hash === contentHash) {
    // 通知対象の変化なし。ただし名前・URL等のハッシュ対象外フィールドは
    // サイレントに最新へ更新しておく
    batch.push(upsertStmt)
    return 'unchanged'
  }

  const kind: 'added' | 'updated' = existing ? 'updated' : 'added'
  const legacyMigration = existing !== null && existing !== undefined && !existing.hash.startsWith('v2:')
  batch.push(upsertStmt)
  batch.push(
    db
      .prepare(
        `INSERT INTO snapshots (item_id, item_type, hash, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(item_id) DO UPDATE SET hash = excluded.hash, updated_at = excluded.updated_at`,
      )
      .bind(itemId, itemType, contentHash, nowIso),
  )
  if (notify && !legacyMigration) {
    const summary = summaryOf(kind)
    if (!seenSummaries.has(summary)) {
      seenSummaries.add(summary)
      batch.push(
        db
          .prepare(
            'INSERT INTO changes (item_id, item_type, change_kind, summary, created_at) VALUES (?, ?, ?, ?, ?)',
          )
          .bind(itemId, itemType, kind, summary, nowIso),
      )
    }
  }
  return kind
}

export async function handleIngest(c: Context<{ Bindings: Bindings }>): Promise<Response> {
  const token = c.env.INGEST_TOKEN
  if (!token) return c.json({ error: 'INGEST_TOKEN is not configured' }, 500)
  if (c.req.header('authorization') !== `Bearer ${token}`) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON' }, 400)
  }

  const skipped: string[] = []
  let events: IncomingEvent[]
  try {
    events = sanitize(raw, skipped)
  } catch (e) {
    return c.json({ error: String(e) }, 400)
  }

  const db = c.env.DB
  const now = new Date()
  const nowIso = now.toISOString()
  const eventCounts: Counts = { added: 0, updated: 0, unchanged: 0 }
  const lotteryCounts: Counts = { added: 0, updated: 0, unchanged: 0 }
  const batch: D1PreparedStatement[] = []
  const seenSummaries = new Set<string>()

  for (const ev of events) {
    // サンドーム福井は単一ホールで実質1日1公演のため、日付をIDにする
    // (アーティスト名の表記ゆれによる重複公演を防ぐ)
    const eventId = `ev-${ev.date}`

    // ラチェット: 収集漏れ(null)で既知の値を上書きしない。official は inferred に格下げしない
    const existingEv = await db
      .prepare('SELECT open_time, start_time, source_url, confidence FROM events WHERE id = ?')
      .bind(eventId)
      .first<{ open_time: string | null; start_time: string | null; source_url: string | null; confidence: Confidence }>()
    const evm = {
      open_time: ev.open_time ?? existingEv?.open_time ?? null,
      start_time: ev.start_time ?? existingEv?.start_time ?? null,
      source_url: ev.source_url ?? existingEv?.source_url ?? null,
      confidence: existingEv?.confidence === 'official' ? 'official' : ev.confidence,
    }
    // ハッシュ対象は「通知する価値のある変化」だけに絞る。
    // タイトル・アーティスト名・URLの表記ゆれはサイレントに更新する
    const eventHash = `v2:${await sha256Hex(
      JSON.stringify([ev.date, evm.open_time, evm.start_time, evm.confidence]),
    )}`
    const eventResult = await diffAndUpsert(
      db,
      eventId,
      'event',
      eventHash,
      (kind) =>
        kind === 'added'
          ? `新規公演: ${ev.artist}「${ev.title}」(${ev.date})`
          : `公演更新: ${ev.artist}「${ev.title}」(${ev.date})`,
      db
        .prepare(
          `INSERT INTO events (id, title, artist, date, open_time, start_time, source_url, confidence, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             title = excluded.title, artist = excluded.artist, date = excluded.date,
             open_time = excluded.open_time, start_time = excluded.start_time,
             source_url = excluded.source_url, confidence = excluded.confidence,
             updated_at = excluded.updated_at`,
        )
        .bind(eventId, ev.title, ev.artist, ev.date, evm.open_time, evm.start_time, evm.source_url, evm.confidence, nowIso),
      nowIso,
      batch,
      // 開催済みの公演はサイトに表示されないため、通知もしない
      ev.date >= todayInJst(now),
      seenSummaries,
    )
    eventCounts[eventResult]++
    const eventInPast = ev.date < todayInJst(now)

    const { results: existingLotRows } = await db
      .prepare('SELECT * FROM lotteries WHERE event_id = ?')
      .bind(eventId)
      .all<LotteryRow>()
    const existingLots = new Map(existingLotRows.map((r) => [r.id, r]))

    // この収集が期間情報を1件でも持っているか(削除ガードの判定に使う)
    const runHasPeriod = ev.lotteries.some((l) => l.starts_at || l.ends_at)

    const incomingLotteryIds = new Set<string>()
    for (const l of ev.lotteries) {
      let lotteryId = `lot-${eventId}-${(await sha256Hex(normalizeKey(l.name))).slice(0, 8)}`

      // 表記ゆれ対策: 名前が変わっていても受付期間が完全一致する既存行は
      // 同一の申込とみなしてIDを引き継ぐ(名前はサイレントに最新へ更新される)
      if (!existingLots.has(lotteryId) && (l.starts_at || l.ends_at)) {
        const match = existingLotRows.find(
          (r) => sameInstant(r.starts_at, l.starts_at) && sameInstant(r.ends_at, l.ends_at),
        )
        if (match) lotteryId = match.id
      }
      incomingLotteryIds.add(lotteryId)

      // ラチェット: 期間・URLは null で上書きしない。official は格下げしない
      const old = existingLots.get(lotteryId)
      const lm = {
        starts_at: l.starts_at ?? old?.starts_at ?? null,
        ends_at: l.ends_at ?? old?.ends_at ?? null,
        url: l.url ?? old?.url ?? null,
        confidence: old?.confidence === 'official' ? 'official' : l.confidence,
      }
      const merged: IncomingLottery = { name: l.name, ...lm }
      // 名前・URLの表記ゆれは通知対象にしない(期間と確度の変化だけ通知)
      const lotteryHash = `v2:${await sha256Hex(
        JSON.stringify([lm.starts_at, lm.ends_at, lm.confidence]),
      )}`
      // 通知するのは「行動できる受付」だけ:
      // - 過去公演の受付は通知しない(サイトにも表示されない)
      // - 期間が1つも取れていない受付は通知しない(期間未確認の名前は表記ゆれで
      //   毎晩IDが変わりやすくノイズ源。期間が判明した時点で「抽選更新」として通知される)
      // - 既に締切を過ぎた受付は通知しない(表示はされる)
      const lotteryNotify =
        !eventInPast &&
        (lm.starts_at !== null || lm.ends_at !== null) &&
        !(lm.ends_at && Date.parse(lm.ends_at) < now.getTime())
      const lotteryResult = await diffAndUpsert(
        db,
        lotteryId,
        'lottery',
        lotteryHash,
        (kind) => lotterySummary(ev.artist, merged, kind),
        db
          .prepare(
            `INSERT INTO lotteries (id, event_id, name, starts_at, ends_at, url, confidence, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
               url = excluded.url, confidence = excluded.confidence, updated_at = excluded.updated_at`,
          )
          .bind(lotteryId, eventId, l.name, lm.starts_at, lm.ends_at, lm.url, lm.confidence, nowIso),
        nowIso,
        batch,
        lotteryNotify,
        seenSummaries,
      )
      lotteryCounts[lotteryResult]++
    }

    // 抽選の置換: 今回の収集に含まれない古い抽選(表記ゆれの残骸など)を削除する。
    // ガード: ①今回の収集が空なら削除しない(収集漏れ対策)
    //         ②期間付きの既存行は、今回の収集も期間情報を取れている場合のみ削除
    //           (期間なしの浅い収集結果で、期間付きの良いデータを消さない)
    if (ev.lotteries.length > 0) {
      for (const row of existingLotRows) {
        if (incomingLotteryIds.has(row.id)) continue
        const rowHasPeriod = row.starts_at !== null || row.ends_at !== null
        if (rowHasPeriod && !runHasPeriod) continue
        batch.push(db.prepare('DELETE FROM lotteries WHERE id = ?').bind(row.id))
        batch.push(db.prepare('DELETE FROM snapshots WHERE item_id = ?').bind(row.id))
      }
    }
  }

  if (batch.length > 0) await db.batch(batch)

  return c.json({ ok: true, events: eventCounts, lotteries: lotteryCounts, skipped })
}

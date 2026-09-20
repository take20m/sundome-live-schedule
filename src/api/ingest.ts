import type { Context } from 'hono'
import { todayInJst } from '../lib/db'
import { formatJst } from '../lib/format'
import { hostOf, isDeniedHost, isPlayguideHost, isTopPage, isVenueHost } from '../lib/ticket-url'
import type { Bindings, Confidence, LotteryRow } from '../types'

type IncomingLottery = {
  name: string
  starts_at: string | null
  ends_at: string | null
  url: string | null
  confidence: Confidence
  sold_out?: boolean
}

type IncomingEvent = {
  title: string
  artist: string
  date: string
  open_time: string | null
  start_time: string | null
  source_url: string | null
  artist_url: string | null
  tour_url: string | null
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

/**
 * 転売・まとめサイトのURLは記録しない。捨てた理由は skipped に残して
 * collect ワークフローのログから気づけるようにする
 */
function keepUrl(url: string | null, label: string, skipped: string[]): string | null {
  if (url !== null && isDeniedHost(url)) {
    skipped.push(`${label}: 転売・まとめサイトのため破棄 (${url})`)
    return null
  }
  return url
}

/**
 * ラチェット(null で既知の値を上書きしない)が、既にDBに入っている転売サイトのURLを
 * 守り続けてしまうのを防ぐ。収集側で捨てても old が勝つと消えないため既存値も検査する
 */
function dropDenied(url: string | null | undefined): string | null {
  return url != null && !isDeniedHost(url) ? url : null
}

/**
 * tour_url は「アーティスト側の、その公演・ツアーのページ」。会場ページ(source_url と同じもの)や
 * 公式トップ(artist_url と同じもの)を入れられても「コンサート情報」の飛び先として意味がないので捨てる。
 *
 * トップページ(パスなし)を捨てるのは、公式サイト(artist_url と同じホスト)かプレイガイドのときだけ。
 * tour.mrchildren.jp や sekainoowari-tour.jp のようなツアー専用ドメインは、トップがそのままツアーページ
 * (実データでこの2組を取りこぼしたので条件を緩めた)
 */
function unfitTourUrlReason(url: string, artistUrl: string | null): string | null {
  if (isDeniedHost(url)) return '転売・まとめサイトのため破棄'
  if (isVenueHost(url)) return '会場公式ページのため tour_url としては破棄'
  if (isTopPage(url)) {
    if (isPlayguideHost(url)) return 'プレイガイドのトップページのため tour_url としては破棄'
    if (artistUrl !== null && hostOf(url) === hostOf(artistUrl)) {
      return '公式サイトのトップページ(artist_url と同じ)のため tour_url としては破棄'
    }
  }
  return null
}

function keepTourUrl(url: string | null, artistUrl: string | null, label: string, skipped: string[]): string | null {
  if (url === null) return null
  const reason = unfitTourUrlReason(url, artistUrl)
  if (reason) {
    skipped.push(`${label}: ${reason} (${url})`)
    return null
  }
  return url
}

/** ラチェットで残る既存の tour_url にも同じ検査をかける(過去に入った不適切な値を消すため) */
function dropUnfitTourUrl(url: string | null | undefined, artistUrl: string | null): string | null {
  return url != null && unfitTourUrlReason(url, artistUrl) === null ? url : null
}

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
        url: keepUrl(
          isUrlOrNull(lo.url ?? null) ? ((lo.url as string | null) ?? null) : null,
          `events[${i}].lotteries[${j}].url`,
          skipped,
        ),
        confidence: isConfidence(lo.confidence) ? lo.confidence : 'inferred',
        sold_out: lo.sold_out === true,
      })
    }
    const artistUrl = keepUrl(
      isUrlOrNull(ev.artist_url ?? null) ? ((ev.artist_url as string | null) ?? null) : null,
      `events[${i}].artist_url`,
      skipped,
    )
    out.push({
      title: ev.title.trim(),
      artist: ev.artist.trim(),
      date: ev.date,
      open_time: (ev.open_time as string | null) ?? null,
      start_time: (ev.start_time as string | null) ?? null,
      source_url: keepUrl(
        isUrlOrNull(ev.source_url ?? null) ? ((ev.source_url as string | null) ?? null) : null,
        `events[${i}].source_url`,
        skipped,
      ),
      artist_url: artistUrl,
      tour_url: keepTourUrl(
        isUrlOrNull(ev.tour_url ?? null) ? ((ev.tour_url as string | null) ?? null) : null,
        artistUrl,
        `events[${i}].tour_url`,
        skipped,
      ),
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

/**
 * 通知判定ハッシュのバージョン。
 *
 * ⚠️ ハッシュの材料(eventHash / lotteryHash に渡す配列)を変更したら、必ずこの値を上げること。
 * 材料が変わると全行のハッシュが変わるため、上げ忘れると「仕様変更による偽の更新」が
 * 購読者全員に一斉配信される。バージョンが違う行は移行扱いとして通知しない。
 *
 * v2: 初版(名前・URLを材料から除外し、表記ゆれで通知しないようにした)
 * v3: lottery の材料に sold_out を追加
 * v4: event の材料の時刻を「値」から「判明したか」に変更。
 *     収集が同一ツアーの別公演日と時刻を取り違えるため(4/25に4/24の17:00を入れ、
 *     翌晩 enrich が16:00へ直す等)、値を材料にすると毎晩「公演更新」が飛んでいた
 */
const HASH_VERSION = 'v4'

/**
 * 通知の方針。
 * - always: 追加も更新も通知する
 * - added-only: 新規追加だけ通知する(内容が動いただけでは通知しない)
 * - never: 通知しない(書き込みはする)
 */
type NotifyPolicy = 'always' | 'added-only' | 'never'

/** ISO文字列の表記ゆれ(+09:00 vs Z等)を吸収して同時刻か判定 */
function sameInstant(a: string | null, b: string | null): boolean {
  if (a == null || b == null) return a === b
  return Date.parse(a) === Date.parse(b)
}

/**
 * snapshots のハッシュと比較し、差分があるときだけ書き込み+changes 追加のステートメントを返す。
 * - notify: 'never' は書き込みだけして通知(changes)に載せない(締切済みの受付など)。
 *   'added-only' は新規追加のみ通知し、内容が動いただけでは通知しない
 * - seenSummaries: 同一リクエスト内の同文通知を1回に抑える(同ツアー複数公演日の重複対策)
 * - ハッシュは HASH_VERSION プレフィックス付き。旧バージョンからの移行時は差分があっても
 *   通知しない(ハッシュ仕様変更による偽の「更新」を一斉配信しないため)
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
  notify: NotifyPolicy,
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
  // ハッシュ仕様が変わっただけの行は通知しない(材料変更による一斉誤通知の防止)
  const hashVersionChanged = existing != null && !existing.hash.startsWith(`${HASH_VERSION}:`)
  batch.push(upsertStmt)
  batch.push(
    db
      .prepare(
        `INSERT INTO snapshots (item_id, item_type, hash, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(item_id) DO UPDATE SET hash = excluded.hash, updated_at = excluded.updated_at`,
      )
      .bind(itemId, itemType, contentHash, nowIso),
  )
  const shouldNotify =
    !hashVersionChanged && (notify === 'always' || (notify === 'added-only' && kind === 'added'))
  if (shouldNotify) {
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
      .prepare('SELECT open_time, start_time, source_url, artist_url, tour_url, confidence FROM events WHERE id = ?')
      .bind(eventId)
      .first<{
        open_time: string | null
        start_time: string | null
        source_url: string | null
        artist_url: string | null
        tour_url: string | null
        confidence: Confidence
      }>()
    const evm = {
      open_time: ev.open_time ?? existingEv?.open_time ?? null,
      start_time: ev.start_time ?? existingEv?.start_time ?? null,
      // 既存値にも検査をかける。そうしないと過去に入った転売サイトのURLが
      // ラチェットに守られて消えない
      source_url: ev.source_url ?? dropDenied(existingEv?.source_url),
      artist_url: ev.artist_url ?? dropDenied(existingEv?.artist_url),
      tour_url: ev.tour_url ?? dropUnfitTourUrl(existingEv?.tour_url, ev.artist_url ?? existingEv?.artist_url ?? null),
      confidence: existingEv?.confidence === 'official' ? 'official' : ev.confidence,
    }
    // ハッシュ対象は「通知する価値のある変化」だけに絞る。
    // タイトル・アーティスト名・URLの表記ゆれはサイレントに更新する。
    // 時刻は値ではなく「判明したか」を材料にする。収集は同一ツアーの別公演日と
    // 時刻を取り違えるため、値を入れると毎晩「公演更新」が飛ぶ。
    // 知りたいのは「開場・開演が判明した」瞬間だけで、その後の揺れは黙って反映する
    const eventHash = `${HASH_VERSION}:${await sha256Hex(
      JSON.stringify([ev.date, evm.open_time !== null, evm.start_time !== null, evm.confidence]),
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
          `INSERT INTO events (id, title, artist, date, open_time, start_time, source_url, artist_url, tour_url, confidence, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             title = excluded.title, artist = excluded.artist, date = excluded.date,
             open_time = excluded.open_time, start_time = excluded.start_time,
             source_url = excluded.source_url, artist_url = excluded.artist_url,
             -- 人が調べて入れたツアーページは収集結果で上書きしない(og:image が使えず手動で補正した公演)
             tour_url = CASE WHEN events.tour_manual = 1 THEN events.tour_url ELSE excluded.tour_url END,
             confidence = excluded.confidence, updated_at = excluded.updated_at`,
        )
        .bind(eventId, ev.title, ev.artist, ev.date, evm.open_time, evm.start_time, evm.source_url, evm.artist_url, evm.tour_url, evm.confidence, nowIso),
      nowIso,
      batch,
      // 開催済みの公演はサイトに表示されないため、通知もしない
      ev.date >= todayInJst(now) ? 'always' : 'never',
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

      // ラチェット: 期間・URLは null で上書きしない。official は格下げしない。
      // sold_out は true 方向にのみ倒れる(浅い収集でフラグが消えないように)
      const old = existingLots.get(lotteryId)
      const lm = {
        starts_at: l.starts_at ?? old?.starts_at ?? null,
        ends_at: l.ends_at ?? old?.ends_at ?? null,
        url: l.url ?? dropDenied(old?.url),
        confidence: old?.confidence === 'official' ? 'official' : l.confidence,
        sold_out: l.sold_out === true || old?.sold_out === 1 ? 1 : 0,
      }
      const merged: IncomingLottery = { name: l.name, ...lm, sold_out: lm.sold_out === 1 }
      // 名前・URLの表記ゆれは通知対象にしない(期間・確度・販売終了の変化だけ通知)
      const lotteryHash = `${HASH_VERSION}:${await sha256Hex(
        JSON.stringify([lm.starts_at, lm.ends_at, lm.confidence, lm.sold_out]),
      )}`
      // 通知するのは「行動できる受付」だけ:
      // - 過去公演の受付は通知しない(サイトにも表示されない)
      // - 期間が1つも取れていない受付は通知しない(期間未確認の名前は表記ゆれで
      //   毎晩IDが変わりやすくノイズ源)
      // - 既に締切を過ぎた受付は通知しない(表示はされる)
      // 加えて通知は新規追加のみ(下の 'added-only')。期間が数分ずれた等の更新は
      // 収集の揺れが大半でノイズになるため、黙って反映する
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
            `INSERT INTO lotteries (id, event_id, name, starts_at, ends_at, url, confidence, sold_out, missed_count, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
               url = excluded.url, confidence = excluded.confidence, sold_out = excluded.sold_out,
               missed_count = 0, updated_at = excluded.updated_at`,
          )
          .bind(lotteryId, eventId, l.name, lm.starts_at, lm.ends_at, lm.url, lm.confidence, lm.sold_out, nowIso),
        nowIso,
        batch,
        lotteryNotify ? 'added-only' : 'never',
        seenSummaries,
      )
      lotteryCounts[lotteryResult]++
    }

    // 抽選の置換: 今回の収集に含まれない古い抽選(表記ゆれの残骸など)を削除する。
    // LLMの収集は夜ごとに取れる受付のセットが揺れるため、削除は慎重に:
    //   ①今回の収集が空なら削除しない(収集漏れ対策)
    //   ②期間付きの既存行は、今回の収集も期間情報を取れている場合のみ対象
    //   ③1回見落とされただけでは消さない。2回連続で現れなかった行だけ削除する
    //     (1回で消すと翌晩の再発見が「新規」通知になり、購読者に誤通知が飛ぶ)
    //   ④開催済みの公演では削除しない。受付はもう終わっており、どんな先行があったかの履歴として残す
    if (!eventInPast && ev.lotteries.length > 0) {
      for (const row of existingLotRows) {
        if (incomingLotteryIds.has(row.id)) continue
        const rowHasPeriod = row.starts_at !== null || row.ends_at !== null
        if (rowHasPeriod && !runHasPeriod) continue
        if (row.missed_count >= 1) {
          // snapshots は残す。万一この行が後日復活しても内容が同じなら通知されない
          batch.push(db.prepare('DELETE FROM lotteries WHERE id = ?').bind(row.id))
        } else {
          batch.push(
            db
              .prepare('UPDATE lotteries SET missed_count = missed_count + 1 WHERE id = ?')
              .bind(row.id),
          )
        }
      }
    }
  }

  if (batch.length > 0) await db.batch(batch)

  return c.json({ ok: true, events: eventCounts, lotteries: lotteryCounts, skipped })
}

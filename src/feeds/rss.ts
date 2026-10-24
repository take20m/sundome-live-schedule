import type { ChangeRow } from '../lib/db'
import { nextDay } from '../lib/group'
import { escapeXml } from '../lib/html'

/** 変更が指す公演の ID。lottery の item_id は `lot-<eventId>-<hash8>` 形式なので eventId を取り出す */
function eventIdOf(c: ChangeRow): string {
  return c.item_type === 'event' ? c.item_id : c.item_id.replace(/^lot-/, '').replace(/-[0-9a-f]{8}$/, '')
}

/**
 * 通知クリックで該当公演の詳細ページへ飛べるリンクを作る。
 * クエリ ?c=<change id> で item ごとに一意(リーダーのlink重複判定対策)
 */
export function itemLink(c: ChangeRow, siteUrl: string): string {
  const eventId = eventIdOf(c)
  const path = /^ev-\d{4}-\d{2}-\d{2}$/.test(eventId) ? `/e/${eventId}` : '/'
  const u = new URL(path, siteUrl)
  u.searchParams.set('c', String(c.id))
  return u.toString()
}

/**
 * 同じ夜の収集で、同じアーティストの同じ受付期間に複数の受付が載ったら 1 件にまとめる。
 * 席種違いの同時受付(「最終プレオーダー」「親子最終プレオーダー」「車椅子最終プレオーダー」など)で
 * 通知が並ぶのを防ぐ。サマリは ingest の lotterySummary の書式「抽選情報: アーティスト「受付名」受付 期間」。
 * まとめた item の guid は束の中で最初に記録された通知のもの(既に配信済みの item が再送されない)
 */
export function groupLotteryChanges(changes: ChangeRow[]): ChangeRow[] {
  const SUMMARY_RE = /^(抽選(?:情報|更新)): (.*?)「(.*)」受付 (.*)$/
  const groups = new Map<string, { head: ChangeRow; first: ChangeRow; names: string[] }>()
  const out: (ChangeRow | string)[] = []
  for (const c of changes) {
    const m = c.item_type === 'lottery' ? c.summary.match(SUMMARY_RE) : null
    if (!m) {
      out.push(c)
      continue
    }
    const [, kind, artist, name, period] = m
    const key = [kind, artist, period, c.created_at].join('|')
    const g = groups.get(key)
    if (!g) {
      groups.set(key, { head: c, first: c, names: [name] })
      out.push(key)
    } else {
      if (!g.names.includes(name)) g.names.push(name)
      if (c.id < g.first.id) g.first = c
    }
  }
  return out.map((x) => {
    if (typeof x !== 'string') return x
    const { head, first, names } = groups.get(x)!
    if (names.length === 1) return head
    const [, kind, artist, , period] = head.summary.match(SUMMARY_RE)!
    // 名前は最初に記録された受付を代表にする(並びは収集順)
    const firstName = first.summary.match(SUMMARY_RE)![3]
    return { ...first, summary: `${kind}: ${artist}「${firstName}」ほか${names.length - 1}件 受付 ${period}` }
  })
}

/** 公演の通知のサマリ。ingest の書式「新規公演: アーティスト「公演名」(YYYY-MM-DD)」 */
const EVENT_RE = /^(新規公演|公演更新): (.*?)「(.*)」\((\d{4}-\d{2}-\d{2})\)$/

/** 公演日の並び。連日なら「初日〜最終日」、飛び飛びなら読点でつなぐ */
function dateSpan(dates: string[]): string {
  const ds = [...dates].sort()
  if (ds.length === 1) return ds[0]
  const consecutive = ds.every((d, i) => i === 0 || nextDay(ds[i - 1]) === d)
  return consecutive ? `${ds[0]}〜${ds[ds.length - 1]}` : ds.join('、')
}

/**
 * 同じ夜の収集で、同じアーティスト・同じ公演名の複数日の通知を 1 件にまとめる
 * (「新規公演: …(2027-01-09〜2027-01-11)」)。
 * foldLotteries のときは、その夜に新しく分かった公演の受付の通知も吸収して「＋受付情報N件」にする。
 * 新しいツアーが見つかった夜に、同じ公演の通知が日数×受付の数だけ並ばないように(RSS 向け。
 * メールは受付を 1 行ずつ読めるほうが役に立つので吸収しない)。
 * まとめた item の guid は束の中で最初に記録された通知のもの、リンク先は初日の詳細ページ
 */
export function groupEventChanges(changes: ChangeRow[], foldLotteries = false): ChangeRow[] {
  type Group = { kind: string; artist: string; title: string; members: ChangeRow[]; dates: string[]; lotteries: Set<string> }
  const groups = new Map<string, Group>()
  const keyOf = new Map<ChangeRow, string>()
  // 受付を吸収する先: その夜に新しく分かった公演(記録日時と公演 ID → 束のキー)
  const newEvents = new Map<string, string>()
  for (const c of changes) {
    const m = c.item_type === 'event' ? c.summary.match(EVENT_RE) : null
    if (!m) continue
    const [, kind, artist, title, date] = m
    const key = [kind, artist, title, c.created_at].join('|')
    const g = groups.get(key) ?? { kind, artist, title, members: [], dates: [], lotteries: new Set<string>() }
    groups.set(key, g)
    g.members.push(c)
    if (!g.dates.includes(date)) g.dates.push(date)
    keyOf.set(c, key)
    if (kind === '新規公演') newEvents.set(`${c.created_at}|${c.item_id}`, key)
  }
  if (foldLotteries) {
    for (const c of changes) {
      if (c.item_type !== 'lottery' || !c.summary.startsWith('抽選情報: ')) continue
      const key = newEvents.get(`${c.created_at}|${eventIdOf(c)}`)
      if (!key) continue
      const g = groups.get(key)!
      g.members.push(c)
      g.lotteries.add(c.summary)
      keyOf.set(c, key)
    }
  }
  const out: ChangeRow[] = []
  const emitted = new Set<string>()
  for (const c of changes) {
    const key = keyOf.get(c)
    if (!key) {
      out.push(c)
      continue
    }
    if (emitted.has(key)) continue
    emitted.add(key)
    const g = groups.get(key)!
    if (g.members.length === 1) {
      out.push(c)
      continue
    }
    const first = g.members.reduce((a, b) => (b.id < a.id ? b : a))
    const more = g.lotteries.size > 0 ? ` ＋受付情報${g.lotteries.size}件` : ''
    out.push({
      ...first,
      item_type: 'event',
      item_id: `ev-${[...g.dates].sort()[0]}`,
      summary: `${g.kind}: ${g.artist}「${g.title}」(${dateSpan(g.dates)})${more}`,
    })
  }
  return out
}

export function buildRss(changes: ChangeRow[], siteUrl: string): string {
  const items = groupLotteryChanges(groupEventChanges(changes, true))
    .map((c) => {
      const pubDate = new Date(c.created_at)
      const date = Number.isNaN(pubDate.getTime()) ? new Date() : pubDate
      return `    <item>
      <title>${escapeXml(c.summary)}</title>
      <link>${escapeXml(itemLink(c, siteUrl))}</link>
      <guid isPermaLink="false">change-${c.id}</guid>
      <pubDate>${date.toUTCString()}</pubDate>
    </item>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>サンドーム福井ライブ情報 更新</title>
    <link>${escapeXml(siteUrl)}</link>
    <description>新規公演・チケット抽選情報の更新通知</description>
    <language>ja</language>
${items}
  </channel>
</rss>
`
}

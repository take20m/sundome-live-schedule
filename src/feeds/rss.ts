import type { ChangeRow } from '../lib/db'
import { escapeXml } from '../lib/html'

/**
 * 通知クリックで該当公演の詳細ページへ飛べるリンクを作る。
 * クエリ ?c=<change id> で item ごとに一意(リーダーのlink重複判定対策)。
 * lottery の item_id は `lot-<eventId>-<hash8>` 形式なので eventId を取り出す
 */
function itemLink(c: ChangeRow, siteUrl: string): string {
  const eventId =
    c.item_type === 'event' ? c.item_id : c.item_id.replace(/^lot-/, '').replace(/-[0-9a-f]{8}$/, '')
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

export function buildRss(changes: ChangeRow[], siteUrl: string): string {
  const items = groupLotteryChanges(changes)
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
    <title>サンドーム福井 コンサート・ライブ情報 更新</title>
    <link>${escapeXml(siteUrl)}</link>
    <description>新規公演・チケット抽選情報の更新通知</description>
    <language>ja</language>
${items}
  </channel>
</rss>
`
}

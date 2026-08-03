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

export function buildRss(changes: ChangeRow[], siteUrl: string): string {
  const items = changes
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
    <title>サンドーム福井 ライブ情報 更新</title>
    <link>${escapeXml(siteUrl)}</link>
    <description>新規公演・チケット抽選情報の更新通知</description>
    <language>ja</language>
${items}
  </channel>
</rss>
`
}

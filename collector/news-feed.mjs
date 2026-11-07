// Google ニュースの RSS 検索結果から見出しを取り出し、収集の指示に添える文面にする純関数
// (news.mjs が使う。テストしやすいよう分離)

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

function tag(item, name) {
  const m = item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`))
  return m ? decodeEntities(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '')).trim() : null
}

/**
 * @param {string} xml
 * @returns {{ title: string, source: string | null, publishedAt: string | null }[]}
 */
export function parseNewsRss(xml) {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? []
  return items.flatMap((item) => {
    const raw = tag(item, 'title')
    if (!raw) return []
    const source = tag(item, 'source')
    // 見出しの末尾には「 - 配信元」が付く。配信元は別に持つので外す
    const title = source && raw.endsWith(` - ${source}`) ? raw.slice(0, -(source.length + 3)) : raw
    const date = new Date(tag(item, 'pubDate') ?? '')
    return [{ title, source, publishedAt: Number.isNaN(date.getTime()) ? null : date.toISOString() }]
  })
}

/**
 * 複数の検索結果をまとめ、同じ見出しを除いて新しい順に並べた Markdown の節にする。見出しが無ければ空文字
 * @param {{ title: string, source: string | null, publishedAt: string | null }[]} items
 * @param {{ days: number, limit: number }} opts
 */
export function renderNewsHints(items, { days, limit }) {
  const seen = new Set()
  const unique = items
    .filter((it) => !seen.has(it.title) && seen.add(it.title))
    .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
    .slice(0, limit)
  if (unique.length === 0) return ''
  const jstDate = (iso) => new Date(Date.parse(iso) + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const lines = unique.map(
    (it) => `- ${it.publishedAt ? jstDate(it.publishedAt) : '日付不明'} ${it.title}${it.source ? `(${it.source})` : ''}`,
  )
  // 先頭の空行: prompt.md の末尾に連結されるので、前の段落と分ける
  return [
    '',
    `## 参考: 直近${days}日のニュース見出し`,
    '',
    '本文に「サンドーム福井」を含む記事の見出し(Google ニュースの検索結果、新しい順)。手順3で使う。',
    '',
    ...lines,
    '',
  ].join('\n')
}

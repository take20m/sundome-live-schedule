// HTML から og:image を取り出す純関数(fetch-images.mjs が使う。テストしやすいよう分離)
// 優先順: og:image → og:image:url → og:image:secure_url → twitter:image → twitter:image:src

const META_TAG_RE = /<meta\s[^>]*>/gi
const HEAD_LIMIT = 200_000 // meta は先頭にある。巨大ページでも頭だけ見る

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'))
  return m ? (m[1] ?? m[2] ?? m[3]) : null
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#38;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

/**
 * @param {string} html
 * @param {string} baseUrl 相対 URL の解決に使う(リダイレクト後の最終 URL を渡す)
 * @returns {string | null} 絶対 URL(http/https)。見つからなければ null
 */
export function extractOgImage(html, baseUrl) {
  const head = html.slice(0, HEAD_LIMIT)
  const metas = head.match(META_TAG_RE) ?? []
  const pick = (key) => {
    for (const tag of metas) {
      const prop = (attr(tag, 'property') ?? attr(tag, 'name') ?? '').toLowerCase()
      if (prop !== key) continue
      const content = attr(tag, 'content')
      if (content && content.trim()) return content.trim()
    }
    return null
  }
  const raw =
    pick('og:image') ??
    pick('og:image:url') ??
    pick('og:image:secure_url') ??
    pick('twitter:image') ??
    pick('twitter:image:src')
  if (!raw) return null
  try {
    const u = new URL(decodeEntities(raw), baseUrl)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    return u.toString()
  } catch {
    return null
  }
}

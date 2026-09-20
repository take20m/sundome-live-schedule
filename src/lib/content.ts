/**
 * content/ の Markdown を frontmatter + 本文に分け、HTML にする。
 * 文章はこのリポジトリのファイル(運営者が書く)なので信頼できるが、
 * Markdown 内の生 HTML は使わない前提で無効化しておく(誤って貼ったタグで崩れないように)。
 *
 * 独自記法(ガイド用):
 *   > [!NOTE] 見出し   … 注意の囲み(NOTE=注意 / TIP=ポイント / STORY=体験談)
 *   ```routes           … 行き方カード。1行 = 「駅名|手段|所要時間|距離|一言」
 *   ```map              … 地図(OpenStreetMap)。1行 = 「緯度,経度|ラベル|venue または station」
 */
import { marked } from 'marked'
import type { Tokens } from 'marked'
import { ARTIST_DOCS, GUIDE_DOCS } from '../../content'
import { escapeHtml } from './html'

export type Doc = {
  meta: Record<string, string>
  /** 本文 Markdown */
  body: string
}

export type TocItem = { depth: number; text: string; id: string }

export type RenderedDoc = { html: string; toc: TocItem[]; hasMap: boolean }

/** `---` で囲まれた `key: value` 行だけを読む簡易 frontmatter */
export function parseDoc(raw: string): Doc {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return { meta: {}, body: raw }
  const meta: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/)
    if (kv) meta[kv[1]] = kv[2].trim()
  }
  return { meta, body: m[2] }
}

/** 見出しテキスト → id(日本語はそのまま、空白はハイフン) */
export function slugify(text: string): string {
  return text
    .trim()
    .replace(/[<>"'&]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}\-_.]/gu, '')
    .slice(0, 80)
}

const CALLOUT_LABEL: Record<string, string> = { NOTE: '注意', TIP: 'ポイント', STORY: '体験談' }

function renderRoutes(text: string): string {
  const cards = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = '', how = '', time = '', dist = '', note = ''] = line.split('|').map((s) => s.trim())
      return `<div class="route">
  <div class="route-name">${escapeHtml(name)}</div>
  <div class="route-how">${escapeHtml(how)}</div>
  <div class="route-nums">${time ? `<span class="route-time">${escapeHtml(time)}</span>` : ''}${dist ? `<span class="route-dist">${escapeHtml(dist)}</span>` : ''}</div>
  ${note ? `<div class="route-note">${escapeHtml(note)}</div>` : ''}
</div>`
    })
    .join('\n')
  return `<div class="routes">\n${cards}\n</div>`
}

type MapPoint = { lat: number; lon: number; label: string; kind: 'venue' | 'station' }

function renderMap(text: string): string {
  const points: MapPoint[] = []
  for (const line of text.split('\n')) {
    const [coord = '', label = '', kind = 'station'] = line.split('|').map((s) => s.trim())
    const [lat, lon] = coord.split(',').map(Number)
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !label) continue
    points.push({ lat, lon, label, kind: kind === 'venue' ? 'venue' : 'station' })
  }
  if (points.length === 0) return ''
  const venue = points.find((p) => p.kind === 'venue') ?? points[0]
  const gmaps = `https://www.google.com/maps/search/?api=1&query=${venue.lat},${venue.lon}`
  // データ属性に JSON を入れる。escapeHtml で引用符もエスケープされるので属性として安全
  return `<figure class="map-figure">
<div class="map" data-points="${escapeHtml(JSON.stringify(points))}" role="img" aria-label="${escapeHtml(venue.label)}周辺の地図"></div>
<figcaption><a class="btn-text" href="${escapeHtml(gmaps)}" rel="noopener" target="_blank">Google マップで開く</a><span class="map-credit">地図: © <a href="https://www.openstreetmap.org/copyright" rel="noopener" target="_blank">OpenStreetMap</a> contributors</span></figcaption>
</figure>`
}

marked.use({
  gfm: true,
  breaks: false,
  renderer: {
    // 生 HTML は無効化(エスケープして文字として出す)
    html(token: Tokens.HTML | Tokens.Tag) {
      return escapeHtml(token.text)
    },
    heading(token: Tokens.Heading) {
      const inner = this.parser.parseInline(token.tokens)
      return `<h${token.depth} id="${escapeHtml(slugify(token.text))}">${inner}</h${token.depth}>\n`
    },
    code(token: Tokens.Code) {
      if (token.lang === 'routes') return renderRoutes(token.text)
      if (token.lang === 'map') return renderMap(token.text)
      return `<pre><code>${escapeHtml(token.text)}</code></pre>\n`
    },
    blockquote(token: Tokens.Blockquote) {
      const first = token.tokens[0]
      const m = first?.type === 'paragraph' ? first.raw.match(/^\[!(NOTE|TIP|STORY)\]([^\n]*)\n?([\s\S]*)$/) : null
      if (!m) return `<blockquote>\n${this.parser.parse(token.tokens)}</blockquote>\n`
      const kind = m[1]
      const title = m[2].trim() || CALLOUT_LABEL[kind]
      const rest = [...marked.lexer(m[3]), ...token.tokens.slice(1)]
      return `<aside class="callout callout-${kind.toLowerCase()}"><p class="callout-title">${escapeHtml(title)}</p>\n${this.parser.parse(rest)}</aside>\n`
    },
  },
})

/** Markdown → HTML(見出し id・独自記法込み)。表はスマホで横スクロールできるよう包む */
export function renderDoc(md: string): RenderedDoc {
  const toc: TocItem[] = []
  for (const t of marked.lexer(md)) {
    if (t.type === 'heading' && (t.depth === 2 || t.depth === 3)) {
      toc.push({ depth: t.depth, text: t.text, id: slugify(t.text) })
    }
  }
  let html = marked.parse(md, { async: false }) as string
  html = html.replaceAll('<table>', '<div class="table-wrap"><table>').replaceAll('</table>', '</table></div>')
  return { html, toc, hasMap: html.includes('class="map"') }
}

/** 互換用: HTML だけ欲しいとき */
export function renderMarkdown(md: string): string {
  return renderDoc(md).html
}

/** 目次(h2 のみ。h3 は多すぎるので出さない) */
export function renderToc(toc: TocItem[]): string {
  const items = toc.filter((t) => t.depth === 2)
  if (items.length < 2) return ''
  return `<nav class="toc" aria-label="目次"><p class="toc-title">この記事の内容</p><ol>${items
    .map((t) => `<li><a href="#${escapeHtml(t.id)}">${escapeHtml(t.text)}</a></li>`)
    .join('')}</ol></nav>`
}

/** 地図(Leaflet + OpenStreetMap タイル)を動かす head/body 断片。地図があるページだけ読み込む */
export const MAP_HEAD = `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">`
export const MAP_SCRIPT = `<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>
(function(){
  document.querySelectorAll('.map[data-points]').forEach(function(el){
    var pts = JSON.parse(el.dataset.points);
    var map = L.map(el, { scrollWheelZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    var group = L.featureGroup(pts.map(function(p){
      var m = L.marker([p.lat, p.lon], { title: p.label }).bindTooltip(p.label, { permanent: true, direction: p.kind === 'venue' ? 'top' : 'right', className: 'map-label map-label-' + p.kind });
      return m;
    })).addTo(map);
    map.fitBounds(group.getBounds().pad(0.25));
  });
})();
</script>`

function norm(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
}

const artistDocs = ARTIST_DOCS.map(parseDoc)

/** アーティスト名(表記ゆれ吸収)に対応する解説 */
export function findArtistDoc(artist: string): Doc | null {
  const key = norm(artist)
  return artistDocs.find((d) => d.meta.artist && norm(d.meta.artist) === key) ?? null
}

/** 解説があるアーティスト名の一覧(sitemap 用) */
export function artistDocNames(): string[] {
  return artistDocs.map((d) => d.meta.artist).filter((a): a is string => Boolean(a))
}

export function findGuideDoc(slug: string): Doc | null {
  const raw = GUIDE_DOCS[slug]
  return raw ? parseDoc(raw) : null
}

export function guideSlugs(): string[] {
  return Object.keys(GUIDE_DOCS)
}

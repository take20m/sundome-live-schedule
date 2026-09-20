/**
 * content/ の Markdown を frontmatter + 本文に分け、HTML にする。
 * 文章はこのリポジトリのファイル(運営者が書く)なので信頼できるが、
 * Markdown 内の生 HTML は使わない前提で無効化しておく(誤って貼ったタグで崩れないように)。
 *
 * 独自記法(記事用)。部品は「用途ごとに 1 種類」に絞る:
 *   > [!TIP] 見出し     … 黄: 先に知っておくと便利
 *   > [!FIELD] 見出し   … 青: 現地メモ・補足(体験談もここ)
 *   > [!WARN] 見出し    … 赤: 間違えると困る重要注意(1 記事に 1〜2 個まで)
 *   ```map              … 地図(OpenStreetMap)。1行 = 「緯度,経度|ラベル|venue または station」
 *   ```numbers          … 数字を大きく並べる。1行 = 「数字|ラベル」
 *   ```facts            … 項目と値の一覧(dl)。1行 = 「項目|値」
 *   ```sources          … 出典。1行 = 「ラベル|URL|補足」
 *   表のセルに [基本] / [おすすめ] と書くと、その行を強調しタグを付ける
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

const CALLOUT_LABEL: Record<string, string> = { TIP: '先に知っておくと便利', FIELD: '現地メモ', WARN: '重要' }
/** 旧記法の互換(NOTE→WARN, STORY→FIELD) */
const CALLOUT_ALIAS: Record<string, string> = { NOTE: 'WARN', STORY: 'FIELD' }

/** 「a|b|c」形式の行を配列に。空行は飛ばす */
function rows(text: string): string[][] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split('|').map((c) => c.trim()))
}

function renderNumbers(text: string): string {
  return `<div class="numbers">${rows(text)
    .map(([n = '', label = '']) => `<div><span class="n">${escapeHtml(n)}</span><span class="l">${escapeHtml(label)}</span></div>`)
    .join('')}</div>`
}

function renderFacts(text: string): string {
  return `<dl class="facts">${rows(text)
    .map(([k = '', v = '']) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`)
    .join('')}</dl>`
}

function renderSources(text: string): string {
  return `<ul class="sources">${rows(text)
    .map(([label = '', url = '', note = '']) => {
      const safe = /^https?:\/\//.test(url) ? url : null
      const a = safe ? `<a href="${escapeHtml(safe)}" rel="noopener" target="_blank">${escapeHtml(label)}</a>` : escapeHtml(label)
      return `<li>${a}${note ? ` — ${escapeHtml(note)}` : ''}</li>`
    })
    .join('')}</ul>`
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
      if (token.lang === 'map') return renderMap(token.text)
      if (token.lang === 'numbers') return renderNumbers(token.text)
      if (token.lang === 'facts') return renderFacts(token.text)
      if (token.lang === 'sources') return renderSources(token.text)
      return `<pre><code>${escapeHtml(token.text)}</code></pre>\n`
    },
    blockquote(token: Tokens.Blockquote) {
      const first = token.tokens[0]
      const m = first?.type === 'paragraph' ? first.raw.match(/^\[!(NOTE|TIP|STORY|FIELD|WARN)\]([^\n]*)\n?([\s\S]*)$/) : null
      if (!m) return `<blockquote>\n${this.parser.parse(token.tokens)}</blockquote>\n`
      const kind = CALLOUT_ALIAS[m[1]] ?? m[1]
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
  // 表の行に [基本] / [おすすめ] があれば、その行を強調してタグ化する(編集者の判断を見せる)
  html = html.replace(/<tr>([\s\S]*?)<\/tr>/g, (row, inner: string) => {
    const m = inner.match(/\[(基本|おすすめ)\]/)
    if (!m) return row
    return `<tr class="pick">${inner.replace(/\[(基本|おすすめ)\]/g, '<span class="pick-tag">$1</span>')}</tr>`
  })
  return { html, toc, hasMap: html.includes('class="map"') }
}

/** 互換用: HTML だけ欲しいとき */
export function renderMarkdown(md: string): string {
  return renderDoc(md).html
}

/** frontmatter の「a | b | c」を配列に */
export function splitMeta(v: string | undefined): string[] {
  return (v ?? '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
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

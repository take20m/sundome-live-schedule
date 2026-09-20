/**
 * content/ の Markdown を frontmatter + 本文に分け、HTML にする。
 * 文章はこのリポジトリのファイル(運営者が書く)なので信頼できるが、
 * Markdown 内の生 HTML は使わない前提で無効化しておく(誤って貼ったタグで崩れないように)。
 */
import { marked } from 'marked'
import { ARTIST_DOCS, GUIDE_DOCS } from '../../content'
import { escapeHtml } from './html'

export type Doc = {
  meta: Record<string, string>
  /** 本文 Markdown */
  body: string
}

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

/** Markdown → HTML。生 HTML はエスケープして無効化する */
export function renderMarkdown(md: string): string {
  const html = marked.parse(md, { async: false, gfm: true, breaks: false }) as string
  return html
}

// marked は生 HTML をそのまま通すので、トークン化の段階で無効化する
marked.use({
  renderer: {
    html(token) {
      return escapeHtml(token.text)
    },
  },
})

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

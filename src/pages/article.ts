/**
 * 記事ページ(ガイド・アーティスト・about)の共通の器。
 * 一覧はカード UI なので黄地だが、記事は読み物なので白地・明朝見出しにし、黄は要点にだけ使う。
 * 「編集者が何を重要と判断したか」をレイアウトで見せる: リード文 → 更新日・確認元 → 写真 → 要点 → 本文 → 最終確認日
 */
import type { Doc } from '../lib/content'
import { MAP_HEAD, MAP_SCRIPT, renderDoc, splitMeta } from '../lib/content'
import { escapeHtml } from '../lib/html'
import { iconSvg } from '../lib/icon'
import { buildHeadMeta } from '../lib/seo'
import { ARTICLE_CSS, SITE_CSS, SITE_FOOTER, SITE_HEADER } from './style'

export const SERIF_FONT_LINK =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@600;700&amp;display=swap">'

export type ArticleShell = {
  head: ReturnType<typeof buildHeadMeta>
  /** パンくず(最後が現在地) */
  crumbs: { label: string; href?: string }[]
  /** 「会場ガイド」などのカテゴリ表示 */
  kicker?: string
  title: string
  lead?: string
  byline?: { updated?: string; checked?: string; editor?: string }
  /** 先頭の写真(HTML 断片) */
  hero?: string
  /** 要点(1 行ずつ) */
  verdict?: string[]
  /** 本文 HTML */
  body: string
  /** 本文の後ろに続けるもの(公演カード等) */
  after?: string
  /** 最終確認日の注記 */
  footNote?: string
  hasMap?: boolean
  extraHead?: string
  extraScripts?: string
}

export function renderArticle(a: ArticleShell): string {
  const crumbs = a.crumbs
    .map((c, i) =>
      i === a.crumbs.length - 1 || !c.href
        ? `<span class="here">${escapeHtml(c.label)}</span>`
        : `<a href="${escapeHtml(c.href)}">${escapeHtml(c.label)}</a>`,
    )
    .join('<span class="sep">›</span>')
  const by = a.byline
  const byline =
    by && (by.updated || by.checked || by.editor)
      ? `<div class="byline">${by.updated ? `<span>更新 <b>${escapeHtml(by.updated)}</b></span>` : ''}${by.checked ? `<span>確認元 <b>${escapeHtml(by.checked)}</b></span>` : ''}${by.editor ? `<span>編集 <b>${escapeHtml(by.editor)}</b></span>` : ''}</div>`
      : ''
  const verdict =
    a.verdict && a.verdict.length > 0
      ? `<section class="verdict"><h2>要点</h2><ol>${a.verdict.map((v) => `<li>${renderInline(v)}</li>`).join('')}</ol></section>`
      : ''
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${a.head}
${SERIF_FONT_LINK}
<style>${SITE_CSS}${ARTICLE_CSS}</style>
${a.hasMap ? MAP_HEAD : ''}
${a.extraHead ?? ''}
</head>
<body class="article">
${SITE_HEADER}
<main class="art">
<nav class="crumb" aria-label="パンくず">${crumbs}</nav>
<article class="sheet">
${a.kicker ? `<span class="kicker">${escapeHtml(a.kicker)}</span>` : ''}
<h1 class="title">${escapeHtml(a.title)}</h1>
${a.lead ? `<p class="lead">${escapeHtml(a.lead)}</p>` : ''}
${byline}
${a.hero ?? ''}
${verdict}
<div class="prose">
${a.body}
</div>
${a.footNote ? `<p class="foot-check">${escapeHtml(a.footNote)}</p>` : ''}
</article>
${a.after ?? ''}
</main>
${SITE_FOOTER}
${a.hasMap ? MAP_SCRIPT : ''}
${a.extraScripts ?? ''}
</body>
</html>`
}

/** 結論行の **強調** だけを許す最小のインライン変換 */
function renderInline(text: string): string {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}

/** Markdown 文書 → 記事の器に必要な部品 */
export function docToShellParts(doc: Doc) {
  const { html, hasMap } = renderDoc(doc.body)
  return {
    body: html,
    hasMap,
    lead: doc.meta.lead,
    verdict: splitMeta(doc.meta.verdict),
    byline: { updated: doc.meta.updated, checked: doc.meta.checked, editor: doc.meta.editor },
    footNote: doc.meta.footnote,
  }
}

export const BACK_TO_LIST = `<div class="back"><a class="btn-text" href="/">${iconSvg('arrow_back')}公演一覧</a></div>`

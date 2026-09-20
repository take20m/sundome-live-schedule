import type { Doc } from '../lib/content'
import { renderMarkdown } from '../lib/content'
import { escapeHtml } from '../lib/html'
import { iconSvg } from '../lib/icon'
import { buildHeadMeta } from '../lib/seo'
import { SITE_CSS, SITE_FOOTER, SITE_HEADER } from './style'

/** Markdown 1 本のガイドページ */
export function renderGuidePage(doc: Doc, canonical: string): string {
  const title = doc.meta.title ?? 'ガイド'
  const head = buildHeadMeta({
    title: `${title} | サンドーム福井 コンサート・ライブ情報`,
    description: doc.meta.description ?? title,
    canonical,
  })
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}
<style>${SITE_CSS}</style>
</head>
<body>
${SITE_HEADER}
<main class="prose">
<div class="back"><a class="btn-text" href="/">${iconSvg('arrow_back')}公演一覧</a></div>
<article class="prose-card">
<h1>${escapeHtml(title)}</h1>
${doc.meta.updated ? `<p class="updated">最終更新 ${escapeHtml(doc.meta.updated)}</p>` : ''}
${renderMarkdown(doc.body)}
</article>
</main>
${SITE_FOOTER}
</body>
</html>`
}

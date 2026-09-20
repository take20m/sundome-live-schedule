import type { Doc } from '../lib/content'
import { MAP_HEAD, MAP_SCRIPT, renderDoc, renderToc } from '../lib/content'
import { escapeHtml } from '../lib/html'
import { iconSvg } from '../lib/icon'
import { buildHeadMeta, DEFAULT_OG_IMAGE } from '../lib/seo'
import { SITE_CSS, SITE_FOOTER, SITE_HEADER } from './style'

/** Markdown 1 本のガイドページ。frontmatter の hero: venue で会場写真を先頭に敷く */
export function renderGuidePage(doc: Doc, canonical: string): string {
  const title = doc.meta.title ?? 'ガイド'
  const { html, toc, hasMap } = renderDoc(doc.body)
  const hero =
    doc.meta.hero === 'venue'
      ? `<picture class="hero"><source media="(max-width: 480px)" srcset="/img/sundome-fukui-16x9.webp"><img src="/img/sundome-fukui-21x9.webp" alt="${escapeHtml(DEFAULT_OG_IMAGE.alt)}" width="1600" height="685" decoding="async" fetchpriority="high"></picture>`
      : ''
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
${hasMap ? MAP_HEAD : ''}
</head>
<body>
${SITE_HEADER}
<main class="prose">
<div class="back"><a class="btn-text" href="/">${iconSvg('arrow_back')}公演一覧</a></div>
<article class="prose-card${hero ? ' has-hero' : ''}">
${hero}
<div class="prose-body">
<h1>${escapeHtml(title)}</h1>
${doc.meta.updated ? `<p class="updated">最終更新 ${escapeHtml(doc.meta.updated)}</p>` : ''}
${renderToc(toc)}
${html}
</div>
</article>
</main>
${SITE_FOOTER}
${hasMap ? MAP_SCRIPT : ''}
</body>
</html>`
}

import type { Doc } from '../lib/content'
import { escapeHtml } from '../lib/html'
import { buildHeadMeta, DEFAULT_OG_IMAGE } from '../lib/seo'
import { docToShellParts, renderArticle } from './article'

/** Markdown 1 本のガイドページ。frontmatter の hero: venue で会場写真を先頭に敷く */
export function renderGuidePage(doc: Doc, canonical: string): string {
  const title = doc.meta.title ?? 'ガイド'
  const parts = docToShellParts(doc)
  const hero =
    doc.meta.hero === 'venue'
      ? `<figure class="hero"><picture><source media="(max-width: 480px)" srcset="/img/sundome-fukui-16x9.webp"><img src="/img/sundome-fukui-21x9.webp" alt="${escapeHtml(DEFAULT_OG_IMAGE.alt)}" width="1600" height="685" decoding="async" fetchpriority="high"></picture><figcaption>${escapeHtml(doc.meta.hero_caption ?? '')}</figcaption></figure>`
      : ''
  return renderArticle({
    head: buildHeadMeta({
      title: `${title} | サンドーム福井 コンサート・ライブ情報`,
      description: doc.meta.description ?? title,
      canonical,
    }),
    crumbs: [{ label: '公演一覧', href: '/' }, { label: 'ガイド' }, { label: doc.meta.short ?? title }],
    kicker: doc.meta.kicker ?? 'ガイド',
    title,
    hero,
    ...parts,
  })
}

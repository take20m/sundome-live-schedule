/** チケットモチーフの SVG。favicon は M3 primary(#6750A4)で固定、ヘッダーのロゴは currentColor で描く */
function ticketSvg(fill: string, fg: string, cls = ''): string {
  return `<svg${cls ? ` class="${cls}"` : ''} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true">
<defs>
<mask id="m">
<rect width="64" height="64" fill="#fff"/>
<circle cx="22" cy="9" r="6" fill="#000"/>
<circle cx="22" cy="55" r="6" fill="#000"/>
</mask>
</defs>
<rect x="3" y="9" width="58" height="46" rx="8" fill="${fill}" mask="url(#m)"/>
<line x1="22" y1="19" x2="22" y2="45" stroke="${fg}" stroke-width="2.6" stroke-dasharray="4.4 4.4" stroke-linecap="round"/>
<rect x="30" y="24" width="22" height="4.5" rx="2.25" fill="${fg}" opacity=".95"/>
<rect x="30" y="34" width="15" height="4.5" rx="2.25" fill="${fg}" opacity=".55"/>
</svg>
`
}

export const BRAND_COLOR = '#6750A4'

/** /favicon.svg。単体ファイルなので CSS 変数は使えず色を固定する */
export const FAVICON_SVG = ticketSvg(BRAND_COLOR, '#FFFFFF')

/** ヘッダーのロゴ。テーマの primary / on-primary に追従する */
export const LOGO_SVG = ticketSvg('currentColor', 'var(--on-primary)', 'logo')

/** Material Symbols(Outlined, 24px グリッド)のパス。外部フォントを読まずに使う分だけ持つ */
const MATERIAL_ICON_PATHS = {
  arrow_back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
  arrow_forward: 'M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z',
  open_in_new:
    'M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z',
  rss_feed:
    'M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19 7.38 20 6.18 20 5 20 4 19 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z',
  schedule:
    'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z',
  place:
    'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
} as const

export type IconName = keyof typeof MATERIAL_ICON_PATHS

export function iconSvg(name: IconName): string {
  return `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${MATERIAL_ICON_PATHS[name]}"/></svg>`
}

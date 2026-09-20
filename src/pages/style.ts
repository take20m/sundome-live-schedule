/**
 * サイト共通のスタイル。Material 3 のトークン(インディゴ系。旧チケット半券デザインの色を継承)を持ち、
 * コンポーネントは必ずトークン経由で色を取る(ライト/ダーク/端末追従の3状態で崩れないため)。
 * 外部ライブラリは使わない。フォントだけ Google Fonts(Roboto + Noto Sans JP)を読む。
 */
import { LOGO_SVG, iconSvg } from '../lib/icon'

export const SITE_HEADER = `<header class="appbar">
<a class="brand" href="/">${LOGO_SVG}<h1><span>サンドーム福井</span> <span>コンサート・ライブ情報</span></h1></a>
<span class="spacer"></span>
<a class="iconbtn" href="/feed.xml" aria-label="RSS フィード" title="RSS">${iconSvg('rss_feed')}</a>
</header>`

export const SITE_FOOTER = `<footer class="site-f">
<a href="/about">このサイトについて</a>
<span>© 2026 take20m</span>
</footer>`

export const SITE_CSS = `
:root {
  color-scheme: light;
  --primary: #3A4FCB; --on-primary: #FFFFFF; --primary-container: #DEE0FF; --on-primary-container: #00105C;
  --secondary-container: #DFE1F9; --on-secondary-container: #171B2C;
  --surface: #FBF8FF;
  --surface-container-low: #F5F2FF; --surface-container: #EFEDFA; --surface-container-highest: #E3E1EC;
  --on-surface: #1B1B21; --on-surface-variant: #45464F; --outline: #767680; --outline-variant: #C6C5D0;
  --error-container: #F9DEDC; --on-error-container: #410E0B;
  --shadow-1: 0 1px 2px rgba(0,0,0,.30), 0 1px 3px 1px rgba(0,0,0,.15);
  --shadow-2: 0 1px 2px rgba(0,0,0,.30), 0 2px 6px 2px rgba(0,0,0,.15);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --primary: #BAC3FF; --on-primary: #00218F; --primary-container: #1F33B0; --on-primary-container: #DEE0FF;
    --secondary-container: #444760; --on-secondary-container: #DFE1F9;
    --surface: #131318;
    --surface-container-low: #1B1B21; --surface-container: #1F1F25; --surface-container-highest: #35343A;
    --on-surface: #E4E1E9; --on-surface-variant: #C6C5D0; --outline: #90909A; --outline-variant: #45464F;
    --error-container: #8C1D18; --on-error-container: #F9DEDC;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --primary: #BAC3FF; --on-primary: #00218F; --primary-container: #1F33B0; --on-primary-container: #DEE0FF;
  --secondary-container: #444760; --on-secondary-container: #DFE1F9;
  --surface: #131318;
  --surface-container-low: #1B1B21; --surface-container: #1F1F25; --surface-container-highest: #35343A;
  --on-surface: #E4E1E9; --on-surface-variant: #C6C5D0; --outline: #90909A; --outline-variant: #45464F;
  --error-container: #8C1D18; --on-error-container: #F9DEDC;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--surface); color: var(--on-surface); font-family: Roboto, "Noto Sans JP", "Hiragino Sans", sans-serif; font-size: 14px; line-height: 20px; letter-spacing: .25px; -webkit-font-smoothing: antialiased; }
a { color: var(--primary); }
.ic { width: 18px; height: 18px; flex: none; }

/* Top app bar (small) */
.appbar { display: flex; align-items: center; gap: 4px; min-height: 64px; max-width: 760px; margin: 0 auto; padding: 8px 4px 8px 16px; }
.brand { display: flex; align-items: center; gap: 12px; color: inherit; text-decoration: none; min-width: 0; }
.logo { width: 28px; height: 28px; color: var(--primary); flex: none; }
.appbar h1 { margin: 0; font-size: 22px; line-height: 28px; font-weight: 400; letter-spacing: 0; }
.appbar h1 span { white-space: nowrap; }
.spacer { flex: 1; }
.iconbtn { display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 24px; color: var(--on-surface-variant); text-decoration: none; }
.iconbtn .ic { width: 24px; height: 24px; }
.iconbtn:hover { background: color-mix(in srgb, var(--on-surface-variant) 8%, transparent); }

main { max-width: 760px; margin: 0 auto; padding: 8px 16px 32px; }
.section { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin: 24px 0 8px; }
.section h2 { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; letter-spacing: .15px; }
.section .sup { font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--on-surface-variant); }

/* 締切リスト(トップ上部): M3 リスト */
.list { background: var(--surface-container-low); border-radius: 16px; overflow: hidden; }
.row { display: flex; align-items: center; gap: 16px; min-height: 72px; padding: 12px 16px; text-decoration: none; color: inherit; border-top: 1px solid var(--outline-variant); }
.row:first-child { border-top: 0; }
.row:hover { background: color-mix(in srgb, var(--on-surface) 8%, transparent); }
.cd { flex: 0 0 7em; font-size: 16px; line-height: 24px; font-weight: 500; letter-spacing: .15px; color: var(--on-surface-variant); font-variant-numeric: tabular-nums; }
.row-open .cd { color: var(--primary); }
.row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.row-h { font-size: 16px; line-height: 24px; letter-spacing: .5px; }
.row-s { color: var(--on-surface-variant); }
.row .chip { flex: none; }

/* チップ(受付状態) */
.chip { display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: 8px; font-size: 12px; line-height: 16px; font-weight: 500; letter-spacing: .5px; white-space: nowrap; border: 1px solid var(--outline); color: var(--on-surface-variant); }
.chip-open { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
.chip-upcoming { background: var(--secondary-container); border-color: transparent; color: var(--on-secondary-container); }
.chip-soldout { background: var(--error-container); border-color: transparent; color: var(--on-error-container); }
.chip-closed, .chip-unknown { color: var(--outline); border-color: var(--outline-variant); }

/* 公演カード: Elevated */
.cards { display: grid; gap: 16px; }
.card { display: flex; flex-direction: column; background: var(--surface-container-low); border-radius: 12px; box-shadow: var(--shadow-1); scroll-margin-top: 16px; overflow: hidden; }
.card-main { display: flex; gap: 16px; padding: 16px; }
/* ツアービジュアル(M3 card with media)。16:9 に揃えて上辺に敷く */
.card-media { display: block; aspect-ratio: 16 / 9; max-width: 100%; background: var(--surface-container-highest); }
.card-media:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
.card-media img { display: block; width: 100%; height: 100%; object-fit: cover; }
.card:hover { box-shadow: var(--shadow-2); }
/* 詳細から /#ev-... で戻ってきた直後、該当カードを一瞬強調して位置を示す */
.card:target, .card:has(.anchor:target) { outline: 3px solid transparent; outline-offset: 3px; animation: card-arrive 2.4s ease-out; }
@keyframes card-arrive { 0%, 40% { outline-color: var(--primary); } 100% { outline-color: transparent; } }
.tile { flex: 0 0 72px; display: flex; flex-direction: column; align-items: center; justify-content: center; align-self: flex-start; padding: 10px 4px; border-radius: 8px; background: var(--surface-container-highest); color: var(--on-surface-variant); font-variant-numeric: tabular-nums; text-align: center; }
.card.is-open .tile, .card.is-today .tile { background: var(--primary-container); color: var(--on-primary-container); }
.tile-m, .tile-w { font-size: 11px; line-height: 16px; letter-spacing: .5px; font-weight: 500; }
.tile-soon { font-size: 11px; line-height: 16px; letter-spacing: .5px; font-weight: 700; color: var(--primary); }
.card.is-today .tile-soon { color: var(--on-primary-container); }
.tile-d { font-size: 32px; line-height: 40px; font-weight: 400; white-space: nowrap; }
.tile-d.range { font-size: 24px; letter-spacing: -.5px; }
.card-body { flex: 1; min-width: 0; }
.card-title { margin: 0; font-size: 22px; line-height: 28px; font-weight: 400; letter-spacing: 0; text-wrap: balance; }
.card-title a { color: inherit; text-decoration: none; }
.card-title a:hover { text-decoration: underline; }
.card-sub { margin: 2px 0 0; color: var(--on-surface-variant); }
.meta { display: flex; flex-wrap: wrap; gap: 4px 16px; margin-top: 8px; color: var(--on-surface-variant); }
.meta-item { display: inline-flex; align-items: center; gap: 6px; }
.lots { list-style: none; margin: 12px 0 0; padding: 12px 0 0; border-top: 1px solid var(--outline-variant); display: grid; gap: 8px; }
.lot { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.lot-closed .lot-name, .lot-closed .lot-period { color: var(--outline); }
.lot-period { margin-left: auto; color: var(--on-surface-variant); font-size: 12px; line-height: 16px; letter-spacing: .4px; font-variant-numeric: tabular-nums; }
.none { margin: 12px 0 0; color: var(--on-surface-variant); }
/* 連日公演: 日ごとの開場・開演。詳細では開いている日を強調 */
.days { display: grid; gap: 2px; margin-top: 8px; color: var(--on-surface-variant); }
.day-focus { color: var(--on-surface); font-weight: 500; }
.day-tag { margin-left: 8px; font-size: 11px; line-height: 16px; letter-spacing: .5px; font-weight: 500; color: var(--primary); }
.lot-note { font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--on-surface-variant); }
/* 2日目以降の /#ev-<日付> 着地点。カード内の先頭に置き、カード自身がスクロール先になる */
.anchor { display: block; height: 0; scroll-margin-top: 16px; }

/* Text button(詳細のリンク・戻る) */
.actions { display: flex; flex-wrap: wrap; gap: 4px; margin: 8px 0 0 -12px; }
.btn-text { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 12px; border-radius: 20px; color: var(--primary); text-decoration: none; font-weight: 500; letter-spacing: .1px; }
.btn-text:hover { background: color-mix(in srgb, var(--primary) 8%, transparent); }
.back { margin: 8px 0 8px -12px; }
.btn-text:focus-visible, .iconbtn:focus-visible, .row:focus-visible, .card-title a:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

/* 固定ページ(about) */
.prose { max-width: 65ch; }
.prose h2 { font-size: 16px; line-height: 24px; font-weight: 500; letter-spacing: .15px; margin: 32px 0 8px; }
.prose p, .prose li { margin: 0 0 8px; }
.prose ul { padding-left: 1.3em; margin: 0 0 8px; }

/* フッター */
.site-f { background: var(--surface-container); padding: 24px 16px 28px; display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--on-surface-variant); font-size: 12px; line-height: 16px; letter-spacing: .4px; }
.site-f a { color: var(--on-surface); text-decoration: none; font-weight: 500; font-size: 14px; }
.more { margin: 24px 0 0 -12px; }
.lot-summary { margin: 12px 0 0; padding-top: 12px; border-top: 1px solid var(--outline-variant); }
.lot-summary a { text-decoration: none; font-weight: 500; }

@media (max-width: 480px) {
  .appbar h1 { font-size: 18px; line-height: 24px; }
  .card-main { padding: 12px; gap: 12px; }
  .tile { flex-basis: 60px; }
  .tile-d { font-size: 28px; line-height: 36px; }
  .tile-d.range { font-size: 22px; }
  .card-title { font-size: 20px; line-height: 26px; }
  .cd { flex-basis: 6em; font-size: 14px; }
  .row { gap: 12px; padding: 12px; }
  .lot-period { margin-left: 0; flex-basis: 100%; }
}
@media (prefers-reduced-motion: no-preference) {
  .card, .row, .btn-text, .iconbtn { transition: background-color .15s, box-shadow .15s; }
}
@media (prefers-reduced-motion: reduce) {
  .card:target, .card:has(.anchor:target) { animation: none; outline-color: var(--primary); }
}
`

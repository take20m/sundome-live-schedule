/**
 * サイト共通のスタイル。Material 3 のトークン(会場公式サイト寄せ: 黄地・白カード・濃紺。モック G 案)を持ち、
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
  --primary: #0B3D91; --on-primary: #FFFFFF; --primary-container: #F7D33B; --on-primary-container: #2A2100;
  --secondary-container: #E4EAF6; --on-secondary-container: #0B3D91;
  --surface: #F7F6F2;
  --surface-container-low: #FFFFFF; --surface-container: #FAF9F6; --surface-container-highest: #F0EEE8;
  --on-surface: #1B1B18; --on-surface-variant: #5C594F; --outline: #8A8578; --outline-variant: #E6E3DC;
  --brand-yellow: #F7D33B;
  --error-container: #F9DEDC; --on-error-container: #410E0B;
  --shadow-1: 0 1px 2px rgba(0,0,0,.30), 0 1px 3px 1px rgba(0,0,0,.15);
  --shadow-2: 0 1px 2px rgba(0,0,0,.30), 0 2px 6px 2px rgba(0,0,0,.15);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --primary: #9FC0FF; --on-primary: #002A73; --primary-container: #F7D33B; --on-primary-container: #1A1600;
    --secondary-container: #12314F; --on-secondary-container: #BDD6FF;
    --surface: #121212;
    --surface-container-low: #1C1C1C; --surface-container: #212121; --surface-container-highest: #2C2C2C;
    --on-surface: #E9E9E6; --on-surface-variant: #A3A29C; --outline: #8C8B85; --outline-variant: #2C2C2C;
    --brand-yellow: #F7D33B;
    --error-container: #8C1D18; --on-error-container: #F9DEDC;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --primary: #9FC0FF; --on-primary: #002A73; --primary-container: #F7D33B; --on-primary-container: #1A1600;
  --secondary-container: #12314F; --on-secondary-container: #BDD6FF;
  --surface: #121212;
  --surface-container-low: #1C1C1C; --surface-container: #212121; --surface-container-highest: #2C2C2C;
  --on-surface: #E9E9E6; --on-surface-variant: #A3A29C; --outline: #8C8B85; --outline-variant: #2C2C2C;
  --brand-yellow: #F7D33B;
  --error-container: #8C1D18; --on-error-container: #F9DEDC;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--surface); color: var(--on-surface); font-family: Roboto, "Noto Sans JP", "Hiragino Sans", sans-serif; font-size: 14px; line-height: 20px; letter-spacing: .25px; -webkit-font-smoothing: antialiased; }
a { color: var(--primary); }
.ic { width: 18px; height: 18px; flex: none; }

/* Top app bar (small) */
/* 白の帯 + 下端に黄のライン。濃紺と黄の二重ラインは圧が強いので黄 1 本に絞った(ヘッダー案 4)。
   会場名を主、説明を従にして 2 段に置く。帯は全幅、中身はコンテンツ幅に揃える */
.appbar { display: flex; align-items: center; gap: 4px; min-height: 64px; padding: 8px max(4px, calc((100% - 752px) / 2)) 8px max(16px, calc((100% - 728px) / 2)); background: var(--surface-container-low); border-bottom: 3px solid var(--brand-yellow); position: relative; z-index: 1; }
.brand { display: flex; align-items: center; gap: 12px; color: inherit; text-decoration: none; min-width: 0; }
.logo { width: 28px; height: 28px; flex: none; border-radius: 7px; }
.appbar h1 { margin: 0; display: flex; flex-direction: column; gap: 2px; font-size: 20px; line-height: 1.15; font-weight: 700; letter-spacing: 3px; }
.appbar h1 span { white-space: nowrap; }
.appbar h1 span + span { font-size: 10.5px; font-weight: 500; letter-spacing: 4.5px; color: var(--on-surface-variant); }
.spacer { flex: 1; }
.iconbtn { display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 24px; color: var(--on-surface-variant); text-decoration: none; }
.iconbtn .ic { width: 24px; height: 24px; }
.iconbtn:hover { background: color-mix(in srgb, var(--on-surface-variant) 8%, transparent); }

main { max-width: 760px; margin: 0 auto; padding: 8px 16px 32px; }
/* 会場写真のバナー(PC 21:9 / スマホ 16:9)。写真は CC BY-SA、クレジットは about ページ(CC BY-SA 4.0 §3(a)(2) によりリンク先での表記で足りる) */
.banner { display: block; margin: 16px 0 8px; border-radius: 12px; overflow: hidden; background: var(--surface-container-highest); aspect-ratio: 21 / 9; max-width: 100%; }
.banner img { display: block; width: 100%; height: 100%; object-fit: cover; }
@media (max-width: 480px) { .banner { aspect-ratio: 16 / 9; } }
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

/* フッター */
.site-f { background: var(--surface-container); padding: 24px 16px 28px; display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--on-surface-variant); font-size: 12px; line-height: 16px; letter-spacing: .4px; }
.site-f a { color: var(--on-surface); text-decoration: none; font-weight: 500; font-size: 14px; }
.more { margin: 24px 0 0 -12px; }
.lot-summary { margin: 12px 0 0; padding-top: 12px; border-top: 1px solid var(--outline-variant); }
.lot-summary a { text-decoration: none; font-weight: 500; }

@media (max-width: 480px) {
  .appbar h1 { font-size: 17px; letter-spacing: 2px; }
  .appbar h1 span + span { font-size: 9.5px; letter-spacing: 3.4px; }
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

/**
 * 記事ページ(ガイド・アーティスト・about)用。body.article で有効。
 * 白地の記事面に明朝の見出し。黄は「カテゴリ表示・見出しの短い線・表の見出し・結論の左線」だけに使う。
 * 部品は用途ごとに 1 種類: 囲み 3 色(黄=便利 / 青=現地メモ / 赤=重要)、数字、一覧(dl)、失敗、判断、出典
 */
export const ARTICLE_CSS = `
/* 地は一覧と同じ黄。本文だけ白い紙面(sheet)に載せる。角丸は小さく影も薄く、UI カードではなく紙に見せる */
.article main.art { max-width: 760px; margin: 0 auto; padding: 0 16px 64px; }
.article .sheet { --paper: #FFFFFF; --surface-container-low: #FFFFFF; --surface-container: #FAF9F6; --surface-container-highest: #F0EEE8; --on-surface: #1B1B18; --on-surface-variant: #5C594F; --outline-variant: #E6E3DC; --yellow: #F7D33B; --yellow-soft: #FFF3B3; --yellow-pale: #FFFBE6; --red: #B3261E; --red-soft: #FBE9E7; --blue: #1A5FB4; --blue-soft: #E8F0FB; --muted: #6F6C63;
  background: var(--paper); color: var(--on-surface); font-size: 16px; line-height: 1.9; border-radius: 4px; padding: 28px clamp(16px, 4vw, 44px) 40px; box-shadow: 0 1px 2px rgba(0,0,0,.14); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .article .sheet { --paper: #1A1A1A; --surface-container-low: #1C1C1C; --surface-container: #212121; --surface-container-highest: #2C2C2C; --on-surface: #E9E9E6; --on-surface-variant: #A3A29C; --outline-variant: #2C2C2C; --yellow-pale: #2A2614; --yellow-soft: #453D1E; --red-soft: #38201D; --blue-soft: #15263B; --blue: #8FB8F0; --red: #F2B8B5; --muted: #8C8B85; } }
:root[data-theme="dark"] .article .sheet { --paper: #1A1A1A; --surface-container-low: #1C1C1C; --surface-container: #212121; --surface-container-highest: #2C2C2C; --on-surface: #E9E9E6; --on-surface-variant: #A3A29C; --outline-variant: #2C2C2C; --yellow-pale: #2A2614; --yellow-soft: #453D1E; --red-soft: #38201D; --blue-soft: #15263B; --blue: #8FB8F0; --red: #F2B8B5; --muted: #8C8B85; }
.article .crumb { font-size: 12px; color: var(--on-surface-variant); margin: 16px 0 12px; letter-spacing: .3px; }
.article .crumb a { color: inherit; text-decoration: none; }
.article .crumb .sep { margin: 0 6px; }
.article .sheet > .kicker:first-child { margin-top: 0; }
.article .kicker { display: inline-block; font-size: 12px; font-weight: 700; letter-spacing: .12em; color: #0B3D91; background: var(--yellow); padding: 2px 10px; border-radius: 2px; margin-bottom: 14px; }
.article .title { font-family: "Noto Serif JP", "Hiragino Mincho ProN", serif; font-size: 30px; line-height: 1.4; font-weight: 700; margin: 0 0 12px; letter-spacing: .01em; text-wrap: balance; }
.article .lead { font-family: "Noto Serif JP", "Hiragino Mincho ProN", serif; font-size: 17px; line-height: 1.9; color: var(--on-surface-variant); margin: 0 0 20px; }
.article .byline { display: flex; flex-wrap: wrap; gap: 6px 20px; font-size: 12.5px; color: var(--muted); border-top: 1px solid var(--outline-variant); border-bottom: 1px solid var(--outline-variant); padding: 10px 0; margin: 0 0 28px; }
.article .byline b { color: var(--on-surface-variant); font-weight: 500; }
.article figure.hero { margin: 0 0 8px; }
.article .sheet > figure.hero { margin-left: calc(clamp(16px, 4vw, 44px) * -1); margin-right: calc(clamp(16px, 4vw, 44px) * -1); }
.article .sheet > figure.hero img { border-radius: 0; }
.article .sheet > figure.hero figcaption { padding: 0 clamp(16px, 4vw, 44px); }
.article figure.hero img { display: block; width: 100%; aspect-ratio: 21 / 9; object-fit: cover; border-radius: 4px; background: var(--surface-container-highest); }
.article figure.hero figcaption { font-size: 12px; color: var(--muted); margin-top: 6px; }
.article .verdict { margin: 36px 0 44px; padding: 20px 24px 20px 28px; background: var(--yellow-pale); border-left: 6px solid var(--yellow); }
.article .verdict h2 { font-family: "Noto Serif JP", serif; font-size: 18px; margin: 0 0 10px; }
.article .verdict ol { margin: 0; padding-left: 1.3em; }
.article .verdict li { margin: 6px 0; }
.article .verdict strong { color: var(--primary); }
.article .prose h2 { font-family: "Noto Serif JP", "Hiragino Mincho ProN", serif; font-size: 24px; line-height: 1.4; font-weight: 700; margin: 56px 0 16px; padding-bottom: 8px; border-bottom: 2px solid var(--on-surface); position: relative; }
.article .prose h2::after { content: ""; position: absolute; left: 0; bottom: -2px; width: 56px; height: 2px; background: var(--yellow); }
.article .prose h3 { font-family: "Noto Serif JP", "Hiragino Mincho ProN", serif; font-size: 18px; margin: 32px 0 8px; }
.article .prose p { margin: 0 0 14px; }
.article .prose ul, .article .prose ol { margin: 0 0 14px; padding-left: 1.4em; }
.article .prose li { margin: 4px 0; }
.article .prose img { max-width: 100%; border-radius: 4px; }
.article .prose blockquote { margin: 12px 0; padding: 4px 16px; border-left: 3px solid var(--outline-variant); color: var(--on-surface-variant); }
/* 表: 見出し行だけ黄。[基本]/[おすすめ] の行を強調 */
.article .table-wrap { overflow-x: auto; margin: 8px 0 4px; }
.article .prose table { width: 100%; border-collapse: collapse; font-size: 14px; line-height: 1.6; }
.article .prose th { background: var(--yellow-soft); text-align: left; padding: 10px; font-weight: 700; border-bottom: 2px solid var(--yellow); }
.article .prose td { padding: 12px 10px; border-bottom: 1px solid var(--outline-variant); vertical-align: top; }
.article .prose tr.pick td { background: var(--yellow-pale); }
.article .pick-tag { display: inline-block; font-size: 11px; font-weight: 700; color: #fff; background: var(--primary); border-radius: 2px; padding: 1px 6px; margin-left: 6px; vertical-align: middle; }
/* 囲み 3 種 */
.article .callout { margin: 20px 0; padding: 12px 16px 12px 18px; font-size: 14.5px; line-height: 1.75; border-radius: 0 4px 4px 0; border-left: 4px solid var(--yellow); background: var(--yellow-pale); }
.article .callout p { margin: 0 0 6px; }
.article .callout p:last-child { margin-bottom: 0; }
.article .callout-title { font-weight: 700; }
.article .callout-field { border-left-color: var(--blue); background: var(--blue-soft); }
.article .callout-field .callout-title { color: var(--blue); }
.article .callout-warn { border-left-color: var(--red); background: var(--red-soft); }
.article .callout-warn .callout-title { color: var(--red); }
/* 数字 */
.article .numbers { display: flex; flex-wrap: wrap; gap: 8px 32px; margin: 8px 0 16px; }
.article .numbers div { display: flex; flex-direction: column; }
.article .numbers .n { font-family: Roboto, sans-serif; font-size: 28px; line-height: 1.1; font-weight: 500; color: var(--primary); font-variant-numeric: tabular-nums; }
.article .numbers .l { font-size: 12px; color: var(--muted); }
/* 一覧 */
.article dl.facts { display: grid; grid-template-columns: max-content 1fr; gap: 6px 20px; margin: 8px 0 16px; font-size: 15px; }
.article dl.facts dt { color: var(--muted); font-weight: 500; }
.article dl.facts dd { margin: 0; }
/* 出典・最終確認 */
.article .sources { font-size: 13.5px; }
.article .foot-check { font-size: 12.5px; color: var(--muted); margin: 24px 0 0; }
/* 地図 */
.article .map-figure { margin: 12px 0 20px; }
.article .map { height: 300px; border-radius: 4px; overflow: hidden; background: var(--surface-container-highest); }
.article .map-figure figcaption { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin: 4px 0 0 -12px; font-size: 12px; color: var(--muted); }
.article .map-credit a { color: inherit; }
.leaflet-tooltip.map-label { font: 500 12px/16px Roboto, "Noto Sans JP", sans-serif; border-radius: 6px; }
.leaflet-tooltip.map-label-venue { background: #0B3D91; color: #fff; border-color: #0B3D91; }
.leaflet-tooltip.map-label-venue::before { border-top-color: #0B3D91; }
.leaflet-container { font: inherit; }
/* 記事の後ろの公演カード(アーティストページ)。白地の上では枝線で区切る */
.article .section { margin-top: 48px; }
.article .section h2 { font-family: "Noto Serif JP", "Hiragino Mincho ProN", serif; font-size: 20px; font-weight: 700; }
@media (max-width: 480px) {
  .article .title { font-size: 25px; }
  .article .prose h2 { font-size: 21px; margin-top: 44px; }
  .article .verdict { padding: 16px 16px 16px 20px; }
  .article figure.hero img { aspect-ratio: 16 / 9; }
  .article dl.facts { grid-template-columns: 1fr; gap: 0; }
  .article dl.facts dt { margin-top: 8px; }
}
`

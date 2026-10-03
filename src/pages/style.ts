/**
 * サイト共通のスタイル。Material 3 のトークン(会場公式サイト寄せ: 黄地・白カード・濃紺。モック G 案)を持ち、
 * コンポーネントは必ずトークン経由で色を取る(ライト/ダーク/端末追従の3状態で崩れないため)。
 * 外部ライブラリは使わない。フォントだけ Google Fonts(Roboto + Noto Sans JP)を読む。
 */
import { LOGO_SVG, iconSvg } from '../lib/icon'

export const SITE_HEADER = `<header class="appbar">
<a class="brand" href="/">${LOGO_SVG}<h1><span>サンドーム福井</span> <span>ライブ情報</span></h1></a>
<span class="spacer"></span>
<a class="iconbtn sub-ic" href="/subscribe" aria-label="新着情報を受け取る" title="新着情報を受け取る">${iconSvg('notification_add')}</a>
</header>
<script>
// 下へスクロールしたらヘッダーを隠し、上へ一定量(48px)戻したら出す。ページ先頭付近では常に出す
(function () {
  var h = document.querySelector('.appbar');
  if (!h) return;
  var last = window.scrollY, up = 0, SHOW_AFTER = 48;
  window.addEventListener('scroll', function () {
    var y = window.scrollY, d = y - last;
    last = y;
    if (y <= h.offsetHeight) { h.classList.remove('is-hidden'); up = 0; return; }
    if (d > 0) { up = 0; h.classList.add('is-hidden'); }
    else { up -= d; if (up >= SHOW_AFTER) h.classList.remove('is-hidden'); }
  }, { passive: true });
})();
</script>`

export const SITE_FOOTER = `<footer class="site-f">
<a href="/subscribe">新着情報を受け取る</a>
<a href="/about">このサイトについて</a>
<span>© 2026 take20m</span>
</footer>`

/**
 * ダーク時のトークン。OS 追従(@media)と手動切り替え([data-theme="dark"])の両方に同じ値が必要で、
 * 書き写すと片方だけ古くなるので 1 か所にまとめて両方へ埋め込む。記事(.sheet)側も同じ理由で下に持つ
 */
const DARK_TOKENS = `color-scheme: dark;
  --primary: #9FC0FF; --on-primary: #002A73; --primary-container: #6C5B13; --on-primary-container: #F2E7B0;
  --secondary-container: #12314F; --on-secondary-container: #BDD6FF;
  --surface: #121212;
  --surface-container-low: #1C1C1C; --surface-container: #212121; --surface-container-highest: #2C2C2C;
  --on-surface: #E9E9E6; --on-surface-variant: #A3A29C; --outline: #8C8B85; --outline-variant: #2C2C2C;
  --brand-yellow: #F7D33B;
  --tile-bar: #2E5AAC; --on-tile-bar: #FFFFFF; --tile-today: #C62828; --tile-body: #2C2C2C; --tile-edge: rgba(255,255,255,.08);
  --error: #F2B8B5; --error-container: #8C1D18; --on-error-container: #F9DEDC;`

const DARK_SHEET_TOKENS = `--paper: #1A1A1A; --surface-container-low: #1C1C1C; --surface-container: #212121; --surface-container-highest: #2C2C2C; --on-surface: #E9E9E6; --on-surface-variant: #A3A29C; --outline-variant: #2C2C2C; --yellow-pale: #2A2614; --yellow-soft: #453D1E; --red-soft: #38201D; --blue-soft: #15263B; --blue: #8FB8F0; --red: #F2B8B5; --muted: #8C8B85;`

export const SITE_CSS = `
:root {
  color-scheme: light;
  /* 日付タイルの地。--brand-yellow より淡い。彩度を落としても受付前(#F0EEE8)との明度比 1.21 を残してある
     ─ 第2色覚では色相が頼りにならないので、明るさの差で受付中と受付前を分ける */
  --primary: #0B3D91; --on-primary: #FFFFFF; --primary-container: #EADA9A; --on-primary-container: #2A2100;
  --secondary-container: #E4EAF6; --on-secondary-container: #0B3D91;
  --surface: #F7F6F2;
  --surface-container-low: #FFFFFF; --surface-container: #FAF9F6; --surface-container-highest: #F0EEE8;
  --on-surface: #1B1B18; --on-surface-variant: #5C594F; --outline: #8A8578; --outline-variant: #E6E3DC;
  --brand-yellow: #F7D33B;
  /* 日付カレンダー: 紺の月の帯と白い地(Apple のカレンダー風)。ダークは帯を少し明るく、地を暗いグレーに */
  --tile-bar: #0B3D91; --on-tile-bar: #FFFFFF; --tile-today: #C62828; --tile-body: #FFFFFF; --tile-edge: rgba(0,0,0,.10);
  --error: #B3261E; --error-container: #F9DEDC; --on-error-container: #410E0B;
  --shadow-1: 0 1px 2px rgba(0,0,0,.30), 0 1px 3px 1px rgba(0,0,0,.15);
  --shadow-2: 0 1px 2px rgba(0,0,0,.30), 0 2px 6px 2px rgba(0,0,0,.15);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
  ${DARK_TOKENS}
  }
}
:root[data-theme="dark"] {
  ${DARK_TOKENS}
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--surface); color: var(--on-surface); font-family: Roboto, "Noto Sans JP", "Hiragino Sans", sans-serif; font-size: 14px; line-height: 20px; letter-spacing: .25px; -webkit-font-smoothing: antialiased; }
a { color: var(--primary); }
.ic { width: 18px; height: 18px; flex: none; }

/* Top app bar (small) */
/* 白の帯 + 下端に黄のライン。濃紺と黄の二重ラインは圧が強いので黄 1 本に絞った(ヘッダー案 4)。
   会場名を主、説明を従にして 2 段に置く。帯は全幅、中身はコンテンツ幅に揃える */
.appbar { display: flex; align-items: center; gap: 4px; min-height: 64px; padding: 8px max(4px, calc((100% - 752px) / 2)) 8px max(16px, calc((100% - 728px) / 2)); background: var(--surface-container-low); border-bottom: 3px solid var(--brand-yellow); position: sticky; top: 0; z-index: 10; }
/* 下へスクロール中は隠す(上へ戻すと出る。キーボードで中に入ったときも出す) */
.appbar.is-hidden:not(:focus-within) { transform: translateY(-100%); }
.brand { display: flex; align-items: center; gap: 12px; color: inherit; text-decoration: none; min-width: 0; }
.logo { width: 28px; height: 28px; flex: none; border-radius: 7px; }
.appbar h1 { margin: 0; display: flex; flex-direction: column; gap: 2px; font-size: 20px; line-height: 1.15; font-weight: 700; letter-spacing: 3px; }
.appbar h1 span { white-space: nowrap; }
.appbar h1 span + span { font-size: 10.5px; font-weight: 500; letter-spacing: 4.5px; color: var(--on-surface-variant); }
.spacer { flex: 1; }
.iconbtn { display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 24px; color: var(--on-surface-variant); text-decoration: none; }
.iconbtn .ic { width: 24px; height: 24px; }
.iconbtn:hover { background: color-mix(in srgb, var(--on-surface-variant) 8%, transparent); }
/* 「新着情報を受け取る」の入口はベル＋プラスを紺で(押せるものだと分かるように、飾りのグレーにしない) */
.iconbtn.sub-ic { color: var(--primary); }

main { max-width: 760px; margin: 0 auto; padding: 8px 16px 32px; }
/* 会場写真のバナー(PC 21:9 / スマホ 16:9)。写真は CC BY-SA、クレジットは about ページ(CC BY-SA 4.0 §3(a)(2) によりリンク先での表記で足りる) */
.banner { display: block; margin: 16px 0 8px; border-radius: 12px; overflow: hidden; background: var(--surface-container-highest); aspect-ratio: 42 / 9; max-width: 100%; }
.banner img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center 60%; }
@media (max-width: 480px) { .banner { aspect-ratio: 32 / 9; } }
.section { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin: 24px 0 8px; }
.section h2 { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; letter-spacing: .15px; }
.section .sup { font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--on-surface-variant); }

/* 締切リスト(トップ上部): M3 リスト */
.list { background: var(--surface-container-low); border-radius: 16px; overflow: hidden; }
.row { display: flex; align-items: center; gap: 16px; min-height: 72px; padding: 12px 16px; text-decoration: none; color: inherit; border-top: 1px solid var(--outline-variant); }
.row:first-child { border-top: 0; }
.row:hover { background: color-mix(in srgb, var(--on-surface) 8%, transparent); }
.row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.row-h { font-size: 16px; line-height: 24px; letter-spacing: .5px; }
.row-s { color: var(--on-surface-variant); }

/* 販売中欄: 横に流れるカード。幅に収まらないときだけスクロール(スマホは次のカードが右に覗く) */
.sale { position: relative; }
.sale-track { list-style: none; display: flex; gap: 10px; margin: 0 -16px; padding: 2px 16px 10px; overflow-x: auto; scroll-snap-type: x mandatory; scroll-padding: 0 16px; overscroll-behavior-x: contain; scrollbar-width: none; }
.sale-track::-webkit-scrollbar { display: none; }
.sale-track li { flex: 0 0 158px; display: flex; scroll-snap-align: start; }
.sale-card { flex: 1; min-width: 0; display: flex; flex-direction: column; background: var(--surface-container-low); border-radius: 14px; overflow: hidden; box-shadow: var(--shadow-1); text-decoration: none; color: inherit; }
.sale-card:hover { background: color-mix(in srgb, var(--on-surface) 6%, var(--surface-container-low)); }
.sale-card:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
/* 画像の縦横比に引っ張られず 16:10 に固定する(正方形の画像だと枠が縦に伸びていた) */
.sale-media { position: relative; flex: none; display: block; aspect-ratio: 16 / 10; overflow: hidden; background: var(--surface-container-highest); }
.sale-media img { position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: cover; }
/* 画像が無い・読み込めないときは公演日を大きく(公演カードの日付タイルと同じ地) */
.sale-date { display: flex; align-items: center; justify-content: center; height: 100%; background: var(--primary-container); color: var(--on-primary-container); font-size: 24px; line-height: 1; font-weight: 500; font-variant-numeric: tabular-nums; white-space: nowrap; }
.sale-date[hidden] { display: none; }
.sale-body { flex: 1; display: flex; flex-direction: column; padding: 9px 10px 10px; }
.sale-h { font-size: 14px; line-height: 19px; min-height: 38px; letter-spacing: .25px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.sale-s { margin: 2px 0 10px; font-size: 11.5px; line-height: 16px; color: var(--on-surface-variant); font-variant-numeric: tabular-nums; }
/* 状態は 1 か所だけ。締切まで 3 日以内は赤で日数、それ以外は青で「受付中」 */
.pill { margin-top: auto; display: flex; align-items: center; gap: 5px; height: 28px; padding: 0 6px 0 8px; border-radius: 14px; background: var(--secondary-container); color: var(--on-secondary-container); font-size: 12.5px; font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums; }
.pill > span { flex: 1; }
.pill .ic { width: 16px; height: 16px; }
.pill .ic:last-child { width: 18px; height: 18px; }
.pill.cd-soon { background: var(--error-container); color: var(--error); }
/* 締切間近は目覚まし時計、受付中はチケット。両方を描いておき、cd-soon で出し分ける(開いたまま切り替わるため) */
.pill .ic-soon, .pill.cd-soon .ic-open { display: none; }
.pill.cd-soon .ic-soon { display: block; }
/* 矢印は幅に収まらないとき(JS が hidden を外す)、マウスのある端末だけ */
.sale-nav { position: absolute; top: 34px; z-index: 1; display: grid; place-items: center; width: 36px; height: 36px; padding: 0; border: 0; border-radius: 50%; background: var(--surface-container-low); color: var(--on-surface); box-shadow: var(--shadow-2); cursor: pointer; }
.sale-nav .ic { width: 22px; height: 22px; }
.sale-prev { left: -10px; }
.sale-next { right: -10px; }
.sale-nav[hidden], .sale-nav:disabled { display: none; }
.sale-nav:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
@media (hover: none) { .sale-nav { display: none; } }
@media (min-width: 600px) {
  .sale-track { margin: 0; padding: 2px 0 10px; scroll-padding: 0; }
  .sale-track li { flex-basis: 170px; }
}

/* チップ(受付状態) */
.chip { display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: 8px; font-size: 12px; line-height: 16px; font-weight: 500; letter-spacing: .5px; white-space: nowrap; border: 1px solid var(--outline); color: var(--on-surface-variant); }
.chip-open { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
.chip-upcoming { background: var(--secondary-container); border-color: transparent; color: var(--on-secondary-container); }
.chip-soldout { background: var(--error-container); border-color: transparent; color: var(--on-error-container); }
/* 過去の公演の年タブ */
.years { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 0; }
.years .chip { height: 32px; padding: 0 14px; font-size: 13px; text-decoration: none; }
.years .chip:not(.chip-open):hover { background: color-mix(in srgb, var(--on-surface-variant) 8%, transparent); }
.chip-closed, .chip-unknown { color: var(--outline); border-color: var(--outline-variant); }

/* 公演カード: Elevated */
.cards { display: grid; gap: 16px; }
.card { display: flex; flex-direction: column; background: var(--surface-container-low); border-radius: 12px; box-shadow: var(--shadow-1); scroll-margin-top: 84px; overflow: hidden; }
.card-main { display: flex; gap: 16px; padding: 16px; }
/* 一覧・アーティスト・過去公演: タイトルのリンクを card-main いっぱいに引き伸ばし、カードのどこを押しても詳細へ */
.card-main.tap { position: relative; cursor: pointer; }
.card-main.tap .card-title a::after { content: ""; position: absolute; inset: 0; }
/* 受付の申込リンク(と過去公演の件数リンク)だけを引き伸ばしたリンクより上に出す。
   チップや行の余白まで上に出すと、そこを押しても何も起きなかった(スマホで「押しても飛ばない」) */
.card-main.tap .lots a, .card-main.tap .lot-summary a { position: relative; z-index: 1; }
/* 申込リンクの上にいるときはカードの当たり判定ではないので、色も付けない */
.card-main.tap:hover:not(:has(.lots a:hover, .lot-summary a:hover)) { background: color-mix(in srgb, var(--on-surface) 8%, transparent); }
/* フォーカスリングは文字ではなく実際の当たり判定に出す */
.card-main.tap:has(.card-title a:focus-visible) { outline: 2px solid var(--primary); outline-offset: -2px; }
.card-main.tap .card-title a:focus-visible { outline: none; }
/* ツアービジュアル(M3 card with media)。16:9 に揃えて上辺に敷く */
.card-media { display: block; aspect-ratio: 16 / 9; max-width: 100%; background: var(--surface-container-highest); }
.card-media:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
.card-media img { display: block; width: 100%; height: 100%; object-fit: cover; }
/* 一覧のカードは日付タイルの代わりに正方形のサムネ。切り出し中心は img の object-position(公演ごとに DB から) */
.thumb { flex: 0 0 92px; width: 92px; height: 92px; align-self: flex-start; border-radius: 10px; overflow: hidden; background: var(--surface-container-highest); }
.thumb img { display: block; width: 100%; height: 100%; object-fit: cover; }
/* 一覧のサムネつきカード: 画像と文字を縦中央にそろえ、日付と名前の間を少し空ける。
   白地の画像でも輪郭が見えるよう薄い縁を重ねる(画像が読み込めず日付タイルに戻ったら :has が外れて元の並び) */
.card-main:has(> .thumb) { align-items: center; }
.card-main:has(> .thumb) .thumb { position: relative; align-self: center; }
.card-main:has(> .thumb) .thumb::after { content: ""; position: absolute; inset: 0; border-radius: inherit; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--on-surface) 10%, transparent); pointer-events: none; }
.card-main:has(> .thumb) .card-date { margin-bottom: 6px; }
.card-main:has(> .thumb) .card-title { font-size: 20px; line-height: 26px; }
.tile-wrap[hidden] { display: none; }
.card-date { margin: 0 0 2px; font-size: 15px; line-height: 20px; font-weight: 700; color: var(--primary); font-variant-numeric: tabular-nums; }
/* 「本日/明日/明後日」は日付の後ろに。本日だけ赤の塗り、明日・明後日は淡い青 */
.card-date .soon { display: inline-block; margin-left: 8px; padding: 1px 8px; border-radius: 6px; background: var(--secondary-container); color: var(--on-secondary-container); font-size: 13px; line-height: 18px; letter-spacing: .5px; vertical-align: 1px; }
/* 本日は詳細のカレンダーの帯と同じ赤(どの画面でも「赤は今日」) */
.card-date .soon.today { background: var(--tile-today); color: #FFFFFF; }
.card:hover { box-shadow: var(--shadow-2); }
/* 詳細から /#ev-... で戻ってきた直後、該当カードを一瞬強調して位置を示す */
.card:target, .card:has(.anchor:target) { outline: 3px solid transparent; outline-offset: 3px; animation: card-arrive 2.4s ease-out; }
@keyframes card-arrive { 0%, 40% { outline-color: var(--primary); } 100% { outline-color: transparent; } }
/* 日付カレンダー。紺の帯に月、白い地に日と曜日。当日は帯を赤い「本日」に、明日・明後日はカレンダーの下に付ける */
.tile-wrap { flex: 0 0 72px; display: flex; flex-direction: column; align-items: center; gap: 6px; align-self: flex-start; }
.tile { width: 100%; display: flex; flex-direction: column; align-items: center; border-radius: 10px; overflow: hidden; background: var(--tile-body); color: var(--on-surface); box-shadow: 0 0 0 1px var(--tile-edge), 0 1px 3px rgba(0,0,0,.12); font-variant-numeric: tabular-nums; text-align: center; }
.tile-bar { display: block; width: 100%; background: var(--tile-bar); color: var(--on-tile-bar); font-size: 11px; line-height: 20px; letter-spacing: .2px; font-weight: 700; white-space: nowrap; }
.tile-bar.today { background: var(--tile-today); letter-spacing: 1px; }
.tile-body { display: flex; flex-direction: column; align-items: center; padding: 6px 4px 9px; }
.tile-d { font-size: 30px; line-height: 38px; font-weight: 500; white-space: nowrap; }
/* 24px は「28・29」(2桁+中黒+2桁)が 72px の枠に収まる上限 */
.tile-d.range { font-size: 24px; letter-spacing: 0; }
.tile-w { font-size: 12px; line-height: 16px; letter-spacing: 0; font-weight: 500; white-space: nowrap; color: var(--on-surface-variant); }
/* 明日・明後日は淡い青のピル(一覧カードのバッジと同じ色) */
.tile-soon { padding: 1px 10px; border-radius: 9px; background: var(--secondary-container); color: var(--on-secondary-container); font-size: 12px; line-height: 18px; font-weight: 700; letter-spacing: .5px; white-space: nowrap; }
/* 区切りは減光せずサイズだけ落とす。地が淡いと 45% で 2.4:1、70% でも 3.6:1 しか出ないため */
.tile-d .sep { font-size: 13px; margin: 0 -2px; vertical-align: 2px; }
.tile-d .sep-en { font-size: 16px; margin: 0 1px; vertical-align: 3px; }
.tile-w .sep { font-size: 10px; margin: 0 -2px; }
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
.lot-note { font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--on-surface-variant); }
/* 2日目以降の /#ev-<日付> 着地点。カード内の先頭に置き、カード自身がスクロール先になる */
.anchor { display: block; height: 0; scroll-margin-top: 84px; }
/* 販売中欄から /e/...#lot-... で飛んできた受付。固定ヘッダーに隠れない位置に着地させ、一瞬だけ色を付けて示す */
.lot { scroll-margin-top: 96px; }
.lot:target { border-radius: 8px; animation: lot-arrive 2.4s ease-out; }
@keyframes lot-arrive { 0%, 40% { background: color-mix(in srgb, var(--primary) 16%, transparent); } 100% { background: transparent; } }

/* Text button(詳細のリンク・戻る) */
.actions { display: flex; flex-wrap: wrap; gap: 4px; margin: 8px 0 0 -12px; }
.btn-text { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 12px; border-radius: 20px; color: var(--primary); text-decoration: none; font-weight: 500; letter-spacing: .1px; }
.btn-text:hover { background: color-mix(in srgb, var(--primary) 8%, transparent); }
.back { margin: 8px 0 8px -12px; }
.btn-text:focus-visible, .iconbtn:focus-visible, .row:focus-visible, .card-title a:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

/* フッター */
.site-f { background: var(--surface-container); padding: 24px 16px 28px; display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--on-surface-variant); font-size: 12px; line-height: 16px; letter-spacing: .4px; }
.site-f a { color: var(--on-surface); text-decoration: none; font-weight: 500; font-size: 14px; }
/* 新着情報への案内: トースト(画面下、PC は右下)と詳細ページのカード */
.sub-toast { position: fixed; left: 12px; right: 12px; bottom: calc(12px + env(safe-area-inset-bottom, 0px)); z-index: 20; display: flex; align-items: flex-start; border-radius: 16px; background: var(--secondary-container); color: var(--on-secondary-container); box-shadow: 0 6px 20px rgba(11,61,145,.22), 0 1px 3px rgba(0,0,0,.12); opacity: 0; transform: translateY(12px); }
.sub-toast.is-shown { opacity: 1; transform: none; }
@media (prefers-reduced-motion: no-preference) { .sub-toast { transition: opacity .25s, transform .25s; } }
@media (min-width: 600px) { .sub-toast { left: auto; right: 20px; bottom: 20px; width: 340px; } }
.sub-toast-link, .sub-card { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; padding: 12px 4px 12px 12px; color: inherit; text-decoration: none; }
.sub-toast-ic { display: grid; place-items: center; flex: none; width: 40px; height: 40px; border-radius: 50%; background: var(--surface-container-low); color: var(--primary); }
.sub-toast-ic .ic { width: 22px; height: 22px; }
.sub-toast-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.sub-toast-text b { font-size: 14px; line-height: 20px; color: var(--primary); }
.sub-toast-text span { font-size: 12px; line-height: 17px; color: var(--on-surface-variant); }
.sub-toast-close { flex: none; display: grid; place-items: center; width: 40px; height: 40px; margin: 4px 4px 0 0; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--on-surface-variant); cursor: pointer; }
.sub-toast-close .ic { width: 20px; height: 20px; }
.sub-toast-close:hover { background: color-mix(in srgb, var(--on-surface) 8%, transparent); }
.sub-toast-link:focus-visible, .sub-toast-close:focus-visible, .sub-card:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; border-radius: 14px; }
.sub-card { margin-top: 14px; padding: 12px; border-radius: 14px; background: var(--secondary-container); color: var(--on-secondary-container); }
.sub-card > .ic { width: 20px; height: 20px; color: var(--primary); flex: none; }
.sub-card:hover { background: color-mix(in srgb, var(--on-secondary-container) 8%, var(--secondary-container)); }

/* 「新着情報を受け取る」ページ */
.sub-block h2 { display: flex; align-items: center; gap: 8px; }
.sub-block h2 .ic { width: 22px; height: 22px; color: var(--primary); }
.sub-btn { display: inline-flex; align-items: center; gap: 8px; height: 44px; margin-top: 16px; padding: 0 20px; border: 0; border-radius: 22px; background: var(--primary); color: var(--on-primary); font: inherit; font-weight: 700; cursor: pointer; }
.sub-btn .ic { width: 20px; height: 20px; }
.sub-url { display: flex; gap: 8px; margin: 12px 0 0; }
.sub-url input { flex: 1; min-width: 0; height: 44px; padding: 0 12px; border: 1px solid var(--outline-variant); border-radius: 10px; background: var(--surface-container); color: var(--on-surface); font: 14px/1 ui-monospace, Menlo, monospace; }
.sub-copy { display: inline-flex; align-items: center; gap: 6px; flex: none; height: 44px; padding: 0 14px; border: 0; border-radius: 10px; background: var(--secondary-container); color: var(--on-secondary-container); font: inherit; font-weight: 700; cursor: pointer; }
.sub-copy .ic { width: 18px; height: 18px; }
.sub-btn:focus-visible, .sub-copy:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.sub-form { margin-top: 12px; display: grid; gap: 10px; }
.sub-form label { font-weight: 700; font-size: 14px; }
.sub-form .sub-url { margin: 0; }
.sub-form input[type="email"] { font: inherit; }
.sub-note { margin: 0; font-size: 13px; color: var(--on-surface-variant); }
.sub-error { margin: 12px 0 0; padding: 8px 12px; border-radius: 8px; background: var(--error-container); color: var(--on-error-container); font-weight: 500; }
/* 端末ごとの手順。スクリプトが端末を見分けたら、その端末の分だけ出す */
#install.os-ios .os-guide:not([data-os="ios"]), #install.os-android .os-guide:not([data-os="android"]), #install.os-desktop .os-guide:not([data-os="desktop"]), #install.is-standalone .os-guide { display: none; }
.os-label { margin: 16px 0 0; font-weight: 700; color: var(--primary); }
.sub-qr { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; margin-top: 12px; }
.sub-qr img { flex: none; width: 132px; height: 132px; padding: 6px; border-radius: 10px; background: #FFFFFF; box-shadow: 0 0 0 1px var(--outline-variant); }
.sub-qr p { flex: 1 1 220px; margin: 0; }
.sub-qr-url { word-break: break-all; }
/* 追加手順の図。4 コマを 2.5 秒ずつ順に見せ、下の手順の該当行を同じ間隔で強調する */
.demo { display: flex; flex-wrap: wrap; align-items: center; gap: 16px 24px; margin-top: 12px; }
.demo-steps { flex: 1 1 220px; margin: 0; padding-left: 1.4em; display: grid; gap: 6px; }
.demo-steps li { color: var(--on-surface-variant); }
.d-phone { --w: 172px; position: relative; flex: none; width: var(--w); height: calc(var(--w) * 2); border-radius: 26px; border: 6px solid #1B1B18; background: #F7F6F2; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,.18); font-family: "Noto Sans JP", "Hiragino Sans", sans-serif; color: #1B1B18; font-size: 9px; line-height: 1.3; }
.d-phone svg { width: 14px; height: 14px; display: block; }
.d-frame { position: absolute; inset: 0; opacity: 0; }
.d-frame:first-child { opacity: 1; }
@media (prefers-reduced-motion: no-preference) {
  .d-frame { animation: d-show4 10s infinite; animation-delay: calc(var(--i) * 2.5s); }
  .n5 .d-frame { animation-name: d-show5; animation-duration: 12.5s; }
  .d-frame:first-child { opacity: 0; }
  .demo-steps li { animation: d-step4 10s infinite; animation-delay: calc(var(--i) * 2.5s); }
  .demo-steps.n5 li { animation-name: d-step5; animation-duration: 12.5s; }
  .d-tap::after { animation: d-pulse 1.25s ease-out infinite; }
}
@media (prefers-reduced-motion: reduce) { .d-phone { display: none; } }
@keyframes d-show4 { 0%, 24% { opacity: 1; } 25%, 100% { opacity: 0; } }
@keyframes d-show5 { 0%, 19% { opacity: 1; } 20%, 100% { opacity: 0; } }
@keyframes d-step4 { 0%, 24% { color: var(--on-surface); font-weight: 700; } 25%, 100% { color: var(--on-surface-variant); font-weight: 400; } }
@keyframes d-step5 { 0%, 19% { color: var(--on-surface); font-weight: 700; } 20%, 100% { color: var(--on-surface-variant); font-weight: 400; } }
@keyframes d-pulse { 0% { box-shadow: 0 0 0 0 rgba(242,183,5,.75); } 100% { box-shadow: 0 0 0 10px rgba(242,183,5,0); } }
/* 押す場所: 黄色の輪で囲み、脈打たせる */
.d-tap { position: relative; border-radius: 8px; box-shadow: 0 0 0 2px #F2B705; }
.d-tap::after { content: ""; position: absolute; inset: 0; border-radius: inherit; }
/* 画面の中のサイトの縮図 */
.d-site { position: absolute; inset: 0; padding-top: 6px; }
.d-and-bar ~ .d-site { top: 30px; }
.d-bar { display: flex; align-items: center; gap: 6px; height: 26px; padding: 0 8px; background: #FFFFFF; border-bottom: 2px solid #F7D33B; }
.d-bar i { width: 60px; height: 7px; border-radius: 4px; background: #1B1B18; opacity: .75; }
.d-logo { display: block; width: 16px; height: 16px; flex: none; }
.d-logo svg { width: 100%; height: 100%; }
.d-logo.big { width: 40px; height: 40px; }
.d-card { height: 44px; margin: 8px 8px 0; border-radius: 6px; background: #FFFFFF; box-shadow: 0 1px 2px rgba(0,0,0,.12); }
.d-card.short { height: 30px; }
/* iPhone の Safari */
/* iOS 26 の Safari: 下に「‹」・アドレス・「…」が浮いた形 */
.d-ios-bar { position: absolute; left: 6px; right: 6px; bottom: 8px; height: 30px; display: flex; align-items: center; gap: 5px; color: #1B1B18; }
.d-ios-bar > span:first-child, .d-more { display: grid; place-items: center; flex: none; width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,.92); box-shadow: 0 1px 4px rgba(0,0,0,.18); }
.d-more { border-radius: 50%; }
.d-pill { flex: 1; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 14px; background: rgba(255,255,255,.92); box-shadow: 0 1px 4px rgba(0,0,0,.18); font-size: 8px; color: #1B1B18; }
.d-ios-bar svg { width: 15px; height: 15px; }
.d-pop { position: absolute; right: 6px; bottom: 44px; width: 134px; padding: 4px; border-radius: 14px; background: rgba(250,250,250,.98); box-shadow: 0 6px 18px rgba(0,0,0,.25); }
.d-pop div { display: flex; align-items: center; gap: 6px; height: 22px; padding: 0 6px; font-size: 8px; border-radius: 8px; white-space: nowrap; }
.d-pop svg { width: 12px; height: 12px; }
.d-apps { display: flex; justify-content: space-around; padding: 2px 0 4px; }
.d-apps i { width: 22px; height: 22px; border-radius: 50%; background: #D7DAE0; }
.d-acts { display: flex; justify-content: space-around; }
.d-acts span { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 8px; background: #FFFFFF; color: #3C3C43; }
.d-acts svg { width: 13px; height: 13px; }
.d-list { display: grid; margin-bottom: 8px; border-radius: 10px; background: #FFFFFF; }
.d-list div { display: flex; align-items: center; gap: 6px; height: 24px; padding: 0 8px; font-size: 9px; border-top: 1px solid #ECECEC; }
.d-list div:first-child { border-top: 0; }
.d-list svg { width: 12px; height: 12px; color: #3C3C43; }
.d-list .d-tap { border-radius: 8px; }
.demo-note { flex-basis: 100%; margin: 0; font-size: 13px; color: var(--on-surface-variant); }
.d-dim { position: absolute; inset: 0; background: rgba(0,0,0,.28); }
.d-sheet { position: absolute; left: 0; right: 0; bottom: 0; padding: 10px 8px 14px; border-radius: 14px 14px 0 0; background: #F2F2F7; display: grid; gap: 6px; }
.d-sheet-h { display: flex; align-items: center; gap: 6px; padding: 0 2px 4px; }
.d-sheet-h b { font-size: 8.5px; }
.d-add { position: absolute; inset: 0; background: #F2F2F7; }
.d-add-bar { display: flex; align-items: center; justify-content: space-between; gap: 4px; height: 32px; margin-top: 10px; padding: 0 6px; font-size: 8px; color: #0A64D8; white-space: nowrap; }
.d-add-bar b { color: #1B1B18; font-size: 8px; }
.d-add-bar .d-tap { padding: 2px 6px; font-weight: 700; }
.d-add-body { display: flex; align-items: center; gap: 8px; margin: 8px; padding: 10px; border-radius: 10px; background: #FFFFFF; }
.d-add-body b { display: block; font-size: 10px; }
.d-add-body small { display: block; font-size: 8px; color: #8A8A8E; }
/* Android の Chrome */
.d-and-bar { position: absolute; top: 0; left: 0; right: 0; height: 30px; display: flex; align-items: center; gap: 4px; padding: 6px 4px 0 8px; background: #FFFFFF; }
.d-url { flex: 1; height: 18px; display: flex; align-items: center; padding: 0 8px; border-radius: 9px; background: #EEF0F3; font-size: 8px; color: #44474E; overflow: hidden; white-space: nowrap; }
.d-and-bar > span:last-child { display: grid; place-items: center; width: 20px; height: 20px; color: #44474E; }
.d-menu { position: absolute; top: 30px; right: 6px; width: 118px; padding: 4px 0; border-radius: 8px; background: #FFFFFF; box-shadow: 0 4px 14px rgba(0,0,0,.22); }
.d-menu div { display: flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; font-size: 9px; }
.d-menu .d-tap { margin: 0 4px; padding: 0 6px; }
.d-menu svg { width: 13px; height: 13px; }
.d-dialog { position: absolute; left: 12px; right: 12px; top: 34%; padding: 12px; border-radius: 14px; background: #FFFFFF; display: grid; gap: 10px; }
.d-dialog b { font-size: 10.5px; }
.d-dialog-app { display: flex; align-items: center; gap: 8px; font-size: 9.5px; }
.d-dialog-btns { display: flex; justify-content: flex-end; gap: 6px; font-size: 9px; color: #0B57D0; font-weight: 700; white-space: nowrap; }
.d-dialog-btns span { padding: 3px 6px; }
/* ホーム画面 */
.d-home { position: absolute; inset: 0; padding: 26px 12px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); align-content: start; gap: 16px 10px; background: linear-gradient(160deg, #6E8FCB, #1E3F7A); }
.d-home i { aspect-ratio: 1; border-radius: 9px; background: rgba(255,255,255,.28); }
.d-app { position: relative; min-width: 0; }
.d-app .d-logo { width: 100%; height: auto; aspect-ratio: 1; border-radius: 9px; overflow: hidden; box-shadow: 0 0 0 2px #F2B705; }
.d-app b { position: absolute; top: calc(100% + 2px); left: 50%; transform: translateX(-50%); font-size: 6.5px; font-weight: 500; color: #FFFFFF; white-space: nowrap; }

.more { margin: 24px 0 0 -12px; }
/* 詳細: 終了・売り切れの受付は畳む。開くと下に並ぶ */
.lots-ended { margin-top: 8px; border-top: 1px solid var(--outline-variant); }
.lots-ended > summary { display: flex; align-items: center; gap: 6px; padding: 8px 0; list-style: none; cursor: pointer; color: var(--on-surface-variant); font-size: 14px; line-height: 20px; font-weight: 500; }
.lots-ended > summary::-webkit-details-marker { display: none; }
.lots-ended > summary .ic { width: 20px; height: 20px; }
.lots-ended[open] > summary .ic { transform: rotate(180deg); }
.lots-ended > summary:hover { color: var(--on-surface); }
.lots-ended > summary:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; border-radius: 4px; }
.lots-ended > .lots { margin-top: 0; padding-top: 4px; border-top: 0; }
.lot-summary { margin: 12px 0 0; padding-top: 12px; border-top: 1px solid var(--outline-variant); }
.lot-summary a { text-decoration: none; font-weight: 500; }

@media (max-width: 480px) {
  .appbar h1 { font-size: 17px; letter-spacing: 2px; }
  .appbar h1 span + span { font-size: 9.5px; letter-spacing: 3.4px; }
  .card-main { padding: 12px; gap: 12px; }
  .thumb { flex-basis: 76px; width: 76px; height: 76px; }
  .tile-wrap { flex-basis: 60px; }
  /* 60px 幅では「2027年10–11月」が 11px だと収まらないので帯を詰める */
  .tile-bar { font-size: 10px; line-height: 18px; letter-spacing: 0; }
  .tile-body { padding: 5px 3px 8px; }
  .tile-d { font-size: 26px; line-height: 34px; }
  .tile-d.range { font-size: 20px; }
  .tile-d .sep { font-size: 11px; }
  .tile-d .sep-en { font-size: 13px; }
  .tile-w { font-size: 11px; }
  .card-title { font-size: 20px; line-height: 26px; }
  .card-main:has(> .thumb) .card-title { font-size: 19px; line-height: 25px; }
  .row { gap: 12px; padding: 12px; }
  .lot-period { margin-left: 0; flex-basis: 100%; }
}
@media (prefers-reduced-motion: no-preference) {
  .card, .row, .sale-card, .btn-text, .iconbtn { transition: background-color .15s, box-shadow .15s; }
  .appbar { transition: transform .2s ease; }
}
@media (prefers-reduced-motion: reduce) {
  .card:target, .card:has(.anchor:target) { animation: none; outline-color: var(--primary); }
  .lot:target { animation: none; background: color-mix(in srgb, var(--primary) 12%, transparent); }
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
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .article .sheet { ${DARK_SHEET_TOKENS} } }
:root[data-theme="dark"] .article .sheet { ${DARK_SHEET_TOKENS} }
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

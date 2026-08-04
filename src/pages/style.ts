/** 一覧・カレンダー共通のスタイル(案A: チケット半券インディゴ) */
import { FAVICON_SVG } from '../lib/icon'

export const SITE_HEADER = `<header>
<p class="eyebrow">SUNDOME FUKUI — TICKET &amp; SCHEDULE</p>
<div class="site-h">
<h1><a href="/"><span class="logo" aria-hidden="true">${FAVICON_SVG}</span><span>サンドーム福井 ライブ情報</span></a></h1>
<nav class="site">
<a href="/feed.xml">RSS</a>
</nav>
</div>
</header>`

export const SITE_FOOTER = `<footer class="site-f">
<div class="inner-f">
<nav><a href="/about">このサイトについて</a></nav>
<span class="f-copy">© 2026 take20m</span>
</div>
</footer>`

export const SITE_CSS = `
:root {
  color-scheme: light dark;
  --bg: #eef0f4; --card: #fbfbfa; --fg: #171a21; --muted: #6b7280;
  --line: #d6dae3; --accent: #2b47c4; --on-accent: #fff; --accent-soft: #e3e8fa;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #14161b; --card: #1c1f26; --fg: #e8eaf0; --muted: #98a0b3;
    --line: #333845; --accent: #93a5f5; --on-accent: #10131c; --accent-soft: #232b46;
  }
}
* { box-sizing: border-box; }
body { margin: 0; font-family: "Avenir Next", "Hiragino Sans", "Noto Sans JP", sans-serif; background: var(--bg); color: var(--fg); line-height: 1.65; -webkit-font-smoothing: antialiased; }
.mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; }
header { padding: clamp(1.5rem, 4vw, 2.5rem) 1rem 0; max-width: 46rem; margin: 0 auto; }
.eyebrow { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: .62rem; letter-spacing: .32em; color: var(--muted); margin: 0 0 .3rem; }
.site-h { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: .4rem .75rem; border-bottom: 3px double var(--fg); padding-bottom: .7rem; }
h1 { font-size: clamp(1.15rem, 4vw, 1.4rem); margin: 0; letter-spacing: .02em; }
h1 a { color: inherit; text-decoration: none; display: inline-flex; align-items: center; gap: .45em; }
.logo { width: 1.3em; height: 1.3em; flex-shrink: 0; }
.logo svg { width: 100%; height: 100%; display: block; }
nav.site a { font-family: ui-monospace, "SF Mono", Menlo, monospace; color: var(--accent); text-decoration: none; font-size: .78rem; letter-spacing: .12em; }
main { max-width: 46rem; margin: 0 auto; padding: 0 1rem 3rem; }
h2.section { display: flex; align-items: center; gap: .75rem; font-size: .72rem; letter-spacing: .18em; color: var(--muted); margin: 2rem 0 .7rem; font-weight: 600; }
h2.section::after { content: ""; flex: 1; height: 1px; background: var(--line); }
.back { margin: 1.6rem 0 .4rem; font-size: .82rem; }
.back a { color: var(--muted); text-decoration: none; }
.back a:hover { color: var(--accent); }

/* 締切が近い受付 */
.deadlines { display: grid; gap: .5rem; }
.deadline { display: flex; gap: 1rem; align-items: center; background: var(--card); border: 1px solid var(--line); border-left: 5px solid var(--line); padding: .65rem 1rem; border-radius: 4px; text-decoration: none; color: inherit; }
.deadline-open { border-left-color: var(--accent); }
.countdown { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-variant-numeric: tabular-nums; font-weight: 700; color: var(--accent); min-width: 6em; font-size: .95rem; }
.deadline .who { font-size: .9rem; font-weight: 600; display: block; }
.deadline .what { font-size: .8rem; color: var(--muted); display: block; }
.deadline .badge { margin-left: auto; }

/* 公演カード(チケット半券) */
.tix { display: flex; background: var(--card); border: 1px solid var(--line); border-radius: 3px; margin: .9rem 0; position: relative; scroll-margin-top: 1rem; }
.tix.open { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.stub { flex: 0 0 7.2rem; border-right: 2px dashed var(--line); padding: 1rem .7rem; text-align: center; font-family: ui-monospace, "SF Mono", Menlo, monospace; }
.tix.open .stub { background: var(--accent-soft); }
.tix::before, .tix::after { content: ""; position: absolute; left: 6.65rem; width: 1.1rem; height: 1.1rem; border-radius: 50%; background: var(--bg); border: 1px solid var(--line); }
.tix::before { top: -0.65rem; } .tix::after { bottom: -0.65rem; }
.tix.open::before, .tix.open::after { border-color: var(--accent); }
.stub .y { font-size: .68rem; color: var(--muted); letter-spacing: .18em; }
.stub .today-label { font-size: .66rem; color: var(--on-accent); background: var(--accent); border-radius: 2px; padding: .06rem .3rem; letter-spacing: .18em; display: inline-block; }
.tix.is-today .stub { background: var(--accent-soft); }
.stub .md { font-size: 1.45rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.2; }
.stub .dw { font-size: .68rem; color: var(--accent); font-weight: 700; letter-spacing: .28em; }
.bod { padding: .9rem 1.1rem 1rem; flex: 1; min-width: 0; }
/* 右端: シリアルナンバー+バーコード風の耳 */
.serial { flex: 0 0 1.6rem; display: flex; align-items: center; justify-content: center; writing-mode: vertical-rl; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: .58rem; letter-spacing: .22em; color: var(--muted); border-left: 1px solid var(--line); background: repeating-linear-gradient(180deg, var(--line) 0 1px, transparent 1px 5px) right / 4px 55% no-repeat; padding: .6rem .15rem; }
.event-title { margin: 0; font-size: clamp(1.05rem, 3.6vw, 1.2rem); line-height: 1.45; letter-spacing: .01em; }
.event-title a { color: inherit; }
.tour-title { font-size: .88rem; color: var(--muted); margin-top: .05rem; }
.event-meta { font-size: .84rem; color: var(--muted); display: flex; gap: .7rem; flex-wrap: wrap; align-items: center; margin-top: .15rem; }
.lotteries { list-style: none; margin: .6rem 0 0; padding: .55rem 0 0; border-top: 1px solid var(--line); font-size: .86rem; }
.lottery { display: flex; gap: .6rem; align-items: baseline; flex-wrap: wrap; padding: .2rem 0; }
.lottery-period { color: var(--muted); font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: .78rem; font-variant-numeric: tabular-nums; }
.badge { font-size: .68rem; padding: .1rem .55rem; border-radius: 2px; letter-spacing: .08em; border: 1px solid var(--line); color: var(--muted); white-space: nowrap; }
.badge-open { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
.badge-upcoming { border-color: var(--accent); color: var(--accent); }
.badge-inferred { font-size: .64rem; }
.no-lottery, .empty { color: var(--muted); font-size: .9rem; }

a { color: var(--accent); }

/* フッター(ミシン目の下・中央揃え2段) */
.site-f { border-top: 2px dashed var(--line); margin-top: 3rem; }
.site-f .inner-f { max-width: 46rem; margin: 0 auto; padding: 1.6rem 1rem 2.2rem; display: flex; flex-direction: column; align-items: center; gap: .7rem; text-align: center; }
.site-f nav { display: flex; align-items: center; gap: 1rem; font-size: .82rem; }
.site-f nav a { color: var(--fg); }
.site-f .f-sep { color: var(--line); }
.site-f .f-copy { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: .7rem; color: var(--muted); letter-spacing: .12em; }

@media (max-width: 480px) {
  .stub { flex-basis: 5.8rem; padding: .8rem .4rem; }
  .tix::before, .tix::after { left: 5.25rem; }
  .countdown { min-width: 5em; font-size: .9rem; }
}
`

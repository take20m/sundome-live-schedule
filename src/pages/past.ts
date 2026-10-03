import type { EventWithLotteries } from '../lib/db'
import { groupConsecutive } from '../lib/group'
import { iconSvg } from '../lib/icon'
import { buildHeadMeta } from '../lib/seo'
import { renderEventCard } from './list'
import { SITE_CSS, SITE_FOOTER, SITE_HEADER } from './style'

type Groups = ReturnType<typeof groupConsecutive>

/**
 * 過去の公演。年をタブで選び、その年だけ新しい順に出す(4 年分を縦に並べると長すぎる)。
 * 抽選は件数だけ出し、詳細で全記録を見せる。canonical は年を含めない /past 固定
 */
export function renderPastPage(
  events: EventWithLotteries[],
  now: Date,
  canonical: string,
  yearParam: string | null,
  opts: { autoScroll?: boolean } = {},
): string {
  // groupConsecutive は日付昇順で返すので、年ごとに束ねてから新しい順に並べ直す
  const byYear = new Map<string, Groups>()
  for (const g of groupConsecutive(events).reverse()) {
    const year = g.first.date.slice(0, 4)
    const list = byYear.get(year) ?? []
    list.push(g)
    byYear.set(year, list)
  }
  const years = [...byYear.keys()].sort((a, b) => b.localeCompare(a))
  // 指定がない、または記録のない年なら、いちばん新しい年
  const year = yearParam !== null && byYear.has(yearParam) ? yearParam : (years[0] ?? null)
  const groups = year ? byYear.get(year)! : []
  const count = (gs: Groups) => gs.reduce((n, g) => n + g.events.length, 0)

  // いちばん下から前の年(古い年)へ進める。新しい年へ戻るリンクも左に添える
  const i = year ? years.indexOf(year) : -1
  const older = i >= 0 ? years[i + 1] : undefined
  const newer = i > 0 ? years[i - 1] : undefined
  const pager =
    older || newer
      ? `<nav class="year-pager" aria-label="ほかの年">${
          newer ? `<a class="btn-text" href="/past?y=${newer}">${iconSvg('chevron_left')}${newer}年</a>` : '<span></span>'
        }${
          older
            ? `<a class="year-next" href="/past?y=${older}">${older}年${iconSvg('chevron_right')}</a>`
            : ''
        }</nav>`
      : ''

  const tabs = years
    .map((y) => `<a class="chip${y === year ? ' chip-open' : ''}" href="/past?y=${y}"${y === year ? ' aria-current="page"' : ''}>${y}年</a>`)
    .join('')
  const body = year
    ? `<nav class="years" aria-label="年を選ぶ">${tabs}</nav>
<section class="past-year" data-year="${year}">
<div class="section"><h2>${year}年</h2><span class="sup">${count(groups)} 公演</span></div>
<div class="cards">
${groups.map((g) => renderEventCard(g, now, { compact: true })).join('\n')}
</div>
</section>
${pager}`
    : '<p class="none">過去の公演の記録はまだありません。</p>'

  const head = buildHeadMeta({
    title: `${year ? `${year}年の公演 | ` : ''}過去の公演 | サンドーム福井ライブ情報`,
    description: 'サンドーム福井(福井県越前市)で開催されたライブ・コンサートの記録。各公演のチケット先行・抽選の受付履歴も残しています。',
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
<main>
<div class="back"><a class="btn-text" href="/">${iconSvg('arrow_back')}今後の公演</a></div>
${body}
</main>
${SITE_FOOTER}
${opts.autoScroll && year ? AUTO_SCROLL_SCRIPT : ''}
</body>
</html>`
}

/**
 * お試し: ?auto=1 のときだけ、年の終わりまで来たら前の年を下に足していく(無限スクロール)。
 * 「読み込み中」とカードの形の仮表示を見せてから、前の年の欄(.past-year)を差し込み、カードを順に浮き上がらせる。
 * 各年の見出しは画面の上に貼りつけ、年タブの強調とアドレスバーの ?y= も今見ている年に合わせる。
 * スクリプトが動かなければ「2024年 ›」のボタンのまま
 */
const AUTO_SCROLL_SCRIPT = `<script>
(function(){
  var pager = document.querySelector('.year-pager');
  if (!pager || !('IntersectionObserver' in window)) return;
  document.body.classList.add('past-auto');
  var back = pager.querySelector('.btn-text'); if (back) back.remove();
  var still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var loading = false;
  var tabs = [].slice.call(document.querySelectorAll('.years .chip'));
  function setYear(y){
    tabs.forEach(function(t){
      var on = t.getAttribute('href') === '/past?y=' + y;
      t.classList.toggle('chip-open', on);
      if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    history.replaceState(null, '', '/past?y=' + y + '&auto=1');
  }
  var seen = new IntersectionObserver(function(es){
    es.forEach(function(e){ if (e.isIntersecting) setYear(e.target.dataset.year); });
  }, { rootMargin: '-35% 0px -60% 0px' });
  document.querySelectorAll('.past-year').forEach(function(s){ seen.observe(s); });
  // 年の終わり(ボタン)が見えたら読み込む。読み込み中はボタンを「読み込み中…」にし、カードの形の仮表示を出す
  function load(){
    var next = pager.querySelector('.year-next');
    if (!next || loading) return;
    loading = true;
    var y = next.textContent.trim();
    next.classList.add('is-loading');
    next.innerHTML = '<span class="spin" aria-hidden="true"></span>' + y + 'を読み込み中…';
    var skel = document.createElement('div');
    skel.className = 'past-skeleton';
    skel.setAttribute('aria-hidden', 'true');
    skel.innerHTML = '<i></i><i></i>';
    pager.parentNode.insertBefore(skel, pager);
    var wait = new Promise(function(r){ setTimeout(r, still ? 0 : 700); });
    Promise.all([fetch(next.getAttribute('href')).then(function(r){ return r.text(); }), wait]).then(function(res){
      var doc = new DOMParser().parseFromString(res[0], 'text/html');
      var sec = doc.querySelector('.past-year');
      skel.remove();
      if (!sec) { next.remove(); return; }
      var added = document.importNode(sec, true);
      added.classList.add('is-arriving');
      [].forEach.call(added.querySelectorAll('.card'), function(c, i){ c.style.setProperty('--d', Math.min(i, 8) * 60 + 'ms'); });
      pager.parentNode.insertBefore(added, pager);
      seen.observe(added);
      var after = doc.querySelector('.year-pager .year-next');
      if (after) next.replaceWith(document.importNode(after, true)); else next.remove();
      loading = false;
    }).catch(function(){ skel.remove(); next.classList.remove('is-loading'); next.textContent = y; loading = false; });
  }
  new IntersectionObserver(function(es){ if (es[0].isIntersecting) load(); }, { rootMargin: '0px 0px -40px 0px' }).observe(pager);
})();
</script>`

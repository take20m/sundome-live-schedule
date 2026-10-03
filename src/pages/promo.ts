import { iconSvg } from '../lib/icon'

/**
 * 新着情報(メール購読)への案内。docs/email-digest.md の入口。
 * - トースト: トップと公演詳細で、開いて 5 秒たったら画面下(PC は右下)に出す。× で閉じるか、押して移ったら 7 日は出さない。
 *   登録完了のページを開いたブラウザでは以後出さない。記録は localStorage だけ(サーバーには送らない)
 * - カード: 開催前の公演の詳細ページで、受付一覧の下に常に置く
 * メール購読を止めているあいだ(キーがないとき)はどちらも出さない(呼び出し側で判定)
 */

/** 文言はここだけで持つ(トーストとカードの両方) */
export const PROMO_COPY = {
  toastTitle: '新着情報を受け取る',
  toastText: '新しい公演や受付が出た日に、メールでお知らせします',
  cardTitle: '次の受付が出たらお知らせ',
}

const STORE = 'sundome.promo'
export const PROMO_HIDE_DAYS = 7
export const PROMO_DELAY_MS = 5000

export function promoToast(): string {
  return `<aside class="sub-toast" id="sub-toast" aria-label="新着情報のお知らせ" hidden>
<a class="sub-toast-link" href="/subscribe#mail"><span class="sub-toast-ic">${iconSvg('notification_add')}</span><span class="sub-toast-text"><b>${PROMO_COPY.toastTitle}</b><span>${PROMO_COPY.toastText}</span></span></a>
<button class="sub-toast-close" type="button" aria-label="閉じる">${iconSvg('close')}</button>
</aside>
<script>
(function(){
  var KEY = '${STORE}', HIDE = ${PROMO_HIDE_DAYS} * 864e5;
  function read(){ try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
  function write(v){ try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} }
  var s = read();
  if (s.subscribed || (s.hiddenAt && Date.now() - s.hiddenAt < HIDE)) return;
  var el = document.getElementById('sub-toast');
  function hide(){ write({ hiddenAt: Date.now() }); el.classList.remove('is-shown'); setTimeout(function(){ el.hidden = true; }, 250); }
  el.querySelector('.sub-toast-close').addEventListener('click', hide);
  el.querySelector('.sub-toast-link').addEventListener('click', function(){ write({ hiddenAt: Date.now() }); });
  addEventListener('keydown', function(e){ if (e.key === 'Escape' && !el.hidden) hide(); });
  setTimeout(function(){ el.hidden = false; requestAnimationFrame(function(){ el.classList.add('is-shown'); }); }, ${PROMO_DELAY_MS});
})();
</script>`
}

/** 登録完了のページに置く。このブラウザでは以後トーストを出さない */
export const PROMO_MARK_SUBSCRIBED = `<script>try { localStorage.setItem('${STORE}', JSON.stringify({ subscribed: true })); } catch (e) {}</script>`

export function promoCard(): string {
  return `<a class="sub-card" href="/subscribe#mail"><span class="sub-toast-ic">${iconSvg('notification_add')}</span><span class="sub-toast-text"><b>${PROMO_COPY.cardTitle}</b></span>${iconSvg('chevron_right')}</a>`
}

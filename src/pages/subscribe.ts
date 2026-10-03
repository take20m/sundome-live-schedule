import { escapeHtml } from '../lib/html'
import { iconSvg, LOGO_SVG } from '../lib/icon'
import { buildHeadMeta } from '../lib/seo'
import { renderArticle } from './article'

/**
 * 「新着情報を受け取る」ページ。ヘッダーのベルから来る。RSS の XML を直接開くとファイルが保存されて
 * しまうので、ここで受け取り方を案内する。通知と SNS は仕組みができてから欄を足す(作りかけは出さない)。
 *
 * ホーム画面への追加は、開いた端末(iPhone / Android / PC)を見分けて、その手順だけを出す。
 * 手順は端末の絵のアニメーションで見せる(実際の画面の録画ではなく、手順の要所だけを描いた図)。
 * 「動きを減らす」設定では絵を止め、番号つきの手順だけにする
 */

// 絵に使う小さなアイコン(Material Symbols のパス)
const P = {
  share:
    'M16 5l-1.42 1.42-1.59-1.59V16h-1.98V4.83L9.42 6.42 8 5l4-4 4 4zm4 5v11c0 1.1-.9 2-2 2H6c-1.11 0-2-.9-2-2V10c0-1.11.89-2 2-2h3v2H6v11h12V10h-3V8h3c1.1 0 2 .89 2 2z',
  addBox: 'M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-8-2h2v-4h4v-2h-4V7h-2v4H7v2h4z',
  back: 'M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z',
  fwd: 'M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z',
  book: 'M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z',
  tabs: 'M19 3H9c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 12H9V5h10v10zM5 7H3v12c0 1.1.9 2 2 2h12v-2H5V7z',
  more: 'M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
  copy: 'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z',
  star: 'M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z',
  dots: 'M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
  plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  up: 'M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z',
  search: 'M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  install: 'M18 1.01L8 1c-1.1 0-2 .9-2 2v3h2V5h10v14H8v-1H6v3c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM10 15h2V8H5v2h3.59L3 15.59 4.41 17 10 11.41z',
}
const ic = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`

// 画面の中に描く、このサイトの縮図(ヘッダーとカード)
const MINI_SITE = `<div class="d-site"><div class="d-bar"><span class="d-logo">${LOGO_SVG}</span><i></i></div><div class="d-card"></div><div class="d-card short"></div><div class="d-card"></div></div>`
const HOME = `<div class="d-home">${'<i></i>'.repeat(5)}<span class="d-app"><span class="d-logo">${LOGO_SVG}</span><b>サンドーム福井</b></span>${'<i></i>'.repeat(6)}</div>`

/**
 * iPhone(Safari, iOS 26): 右下の「…」 → 「共有」 → 共有シートを下へたどって「ホーム画面に追加」 → 「追加」 → ホーム画面にアイコン。
 * 2026-10 に実機の画面収録で確かめた流れ。古い iOS は下の共有ボタンから始まる(手順の下に一文添える)
 */
const IOS_BAR = `<div class="d-ios-bar"><span>${ic(P.back)}</span><span class="d-pill">sundome.take20m.dev</span><span class="d-more">${ic(P.dots)}</span></div>`
const IOS_FRAMES = [
  `${MINI_SITE}${IOS_BAR.replace('class="d-more"', 'class="d-more d-tap"')}`,
  `${MINI_SITE}${IOS_BAR}<div class="d-pop"><div class="d-tap">${ic(P.share)}共有</div><div>${ic(P.book)}ブックマークに追加</div><div>${ic(P.book)}ブックマークの追加先…</div><div>${ic(P.plus)}新規タブ</div><div>${ic(P.plus)}新規プライベートタブ</div></div>`,
  `${MINI_SITE}<div class="d-dim"></div><div class="d-sheet"><div class="d-sheet-h"><span class="d-logo">${LOGO_SVG}</span><b>新着情報を受け取る | サンドーム福井…</b></div>
<div class="d-apps"><i></i><i></i><i></i><i></i></div><div class="d-acts"><span>${ic(P.copy)}</span><span>${ic(P.book)}</span><span>${ic(P.star)}</span><span>${ic(P.up)}</span></div>
<div class="d-list"><div>${ic(P.star)}お気に入りに追加</div><div>${ic(P.search)}ページを検索</div><div class="d-tap">${ic(P.addBox)}ホーム画面に追加</div></div></div>`,
  `<div class="d-add"><div class="d-add-bar"><span>キャンセル</span><b>ホーム画面に追加</b><span class="d-tap">追加</span></div>
<div class="d-add-body"><span class="d-logo big">${LOGO_SVG}</span><div><b>サンドーム福井</b><small>sundome.take20m.dev</small></div></div></div>`,
  HOME,
]
/** Android(Chrome): メニュー → 「ホーム画面に追加」 → 「インストール」 → ホーム画面にアイコン */
const ANDROID_FRAMES = [
  `<div class="d-and-bar"><span class="d-url">sundome.take20m.dev</span><span class="d-tap">${ic(P.more)}</span></div>${MINI_SITE}`,
  `<div class="d-and-bar"><span class="d-url">sundome.take20m.dev</span><span>${ic(P.more)}</span></div>${MINI_SITE}
<div class="d-menu"><div>新しいタブ</div><div>履歴</div><div>ブックマーク</div><div class="d-tap">${ic(P.install)}ホーム画面に追加</div><div>設定</div></div>`,
  `<div class="d-and-bar"><span class="d-url">sundome.take20m.dev</span><span>${ic(P.more)}</span></div>${MINI_SITE}<div class="d-dim"></div><div class="d-dialog"><b>アプリをインストール</b><div class="d-dialog-app"><span class="d-logo">${LOGO_SVG}</span>サンドーム福井</div>
<div class="d-dialog-btns"><span>キャンセル</span><span class="d-tap">インストール</span></div></div>`,
  HOME,
]

function demo(os: 'ios' | 'android', frames: string[], steps: string[], note = ''): string {
  return `<div class="demo" data-demo="${os}">
<div class="d-phone${os === 'android' ? ' android' : ''} n${frames.length}" aria-hidden="true">${frames
    .map((f, i) => `<div class="d-frame" style="--i:${i}">${f}</div>`)
    .join('')}</div>
<ol class="demo-steps n${steps.length}">${steps.map((s, i) => `<li style="--i:${i}">${s}</li>`).join('')}</ol>${note ? `\n<p class="demo-note">${note}</p>` : ''}
</div>`
}

const MAIL_ERRORS: Record<string, string> = {
  bot: '確認がうまくいきませんでした。もう一度お試しください。',
  email: 'メールアドレスの形式を確かめてください。',
  send: '確認メールを送れませんでした。時間をおいてもう一度お試しください。',
}

function mailSection(siteKey: string, error: string | null): string {
  const msg = error && MAIL_ERRORS[error] ? `<p class="sub-error" role="alert">${MAIL_ERRORS[error]}</p>` : ''
  return `<section class="sub-block" id="mail">
<h2>${iconSvg('mail')}メールで受け取る</h2>
<p>新しい公演や抽選の受付情報をメールでお知らせします。</p>
${msg}
<form class="sub-form" method="post" action="/api/subscribe">
<label for="sub-email">メールアドレス</label>
<div class="sub-url">
<input id="sub-email" name="email" type="email" required autocomplete="email" inputmode="email" placeholder="you@example.com">
<button class="sub-copy" type="submit">登録する</button>
</div>
<div class="cf-turnstile" data-sitekey="${escapeHtml(siteKey)}" data-language="ja" data-size="flexible"></div>
<p class="sub-note">登録すると、<a href="/about#privacy">プライバシーポリシー</a>(メールアドレスの扱い)に同意したものとします。配信はメールの末尾のリンクからいつでも停止でき、停止するとアドレスは削除されます。</p>
</form>
</section>`
}

/** 確認メールの送信後・登録完了・配信停止などの短いお知らせページ(検索には載せない) */
export function renderMailNotice(
  canonical: string,
  n: { title: string; lead: string; body: string; extraScripts?: string },
): string {
  return renderArticle({
    head: buildHeadMeta({ title: `${n.title} | サンドーム福井ライブ情報`, description: n.lead, canonical, noindex: true }),
    crumbs: [{ label: '公演一覧', href: '/' }, { label: '新着情報を受け取る', href: '/subscribe' }, { label: n.title }],
    title: n.title,
    lead: n.lead,
    body: n.body,
    extraScripts: n.extraScripts,
  })
}

export function renderSubscribePage(
  canonical: string,
  opts: { turnstileSiteKey?: string | null; mailError?: string | null } = {},
): string {
  const feedUrl = new URL('/feed.xml', canonical).toString()
  const pageUrl = new URL('/subscribe', canonical).toString()
  const body = `${opts.turnstileSiteKey ? mailSection(opts.turnstileSiteKey, opts.mailError ?? null) : ''}<section class="sub-block" id="install">
<h2>${iconSvg('add_to_home_screen')}ホーム画面に追加</h2>
<p>アプリのように、ホーム画面のアイコンからこのサイトを開けます。</p>
<p class="sub-installed" hidden>このサイトはホーム画面から開いています。</p>
<div class="os-guide" data-os="ios">
<p class="os-label">iPhone(Safari)</p>
${demo('ios', IOS_FRAMES, [
  '画面右下の「…」を押します。',
  'メニューの「共有」を選びます。',
  '下へたどって「ホーム画面に追加」を選びます。',
  '右上の「追加」を押します。',
  'ホーム画面にアイコンができます。',
], '古い iOS では、画面下の共有ボタン(四角に上向きの矢印)から始まります。')}
</div>
<div class="os-guide" data-os="android">
<p class="os-label">Android(Chrome)</p>
<button class="sub-btn" type="button" id="install-btn" hidden>${iconSvg('add_to_home_screen')}ホーム画面に追加</button>
${demo('android', ANDROID_FRAMES, [
  '右上のメニュー(縦に3つの点)を押します。',
  '「ホーム画面に追加」を選びます。「アプリをインストール」と出ている場合はそちらを選びます。',
  '「インストール」を押します。',
  'ホーム画面にアイコンができます。',
])}
</div>
<div class="os-guide" data-os="desktop">
<div class="sub-qr"><img src="/img/subscribe-qr.svg" width="132" height="132" alt="このページの QR コード">
<p>ホーム画面への追加は、スマートフォンでこのページを開くとできます。カメラでこの QR コードを読み取るか、<span class="sub-qr-url">${escapeHtml(pageUrl)}</span> を開いてください。</p></div>
</div>
</section>

<section class="sub-block" id="rss">
<h2>${iconSvg('rss_feed')}RSS リーダーで読む</h2>
<p>新しい公演と、一般で申し込める抽選の受付開始を配信しています。RSS リーダーに、次の URL を登録してください。</p>
<div class="sub-url">
<input id="feed-url" type="text" readonly value="${escapeHtml(feedUrl)}" aria-label="RSS の URL">
<button class="sub-copy" type="button" id="copy-feed">${iconSvg('content_copy')}<span>コピー</span></button>
</div>
</section>`
  const script = `<script>
(function(){
  // 端末を見分けて、その手順だけを出す(見分けられなければ PC 向けの案内)。スクリプトが動かなければ全部出る
  var ua = navigator.userAgent;
  var os = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'ios'
    : /Android/.test(ua) ? 'android' : 'desktop';
  var root = document.getElementById('install');
  root.classList.add('os-' + os);
  var standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone) {
    root.classList.add('is-standalone');
    root.querySelector('.sub-installed').hidden = false;
  }
  // Android の Chrome などがインストールを申し出たときは、手順の前にボタンも出す
  var btn = document.getElementById('install-btn'), deferred = null;
  addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); deferred = e; btn.hidden = false; });
  btn.addEventListener('click', function(){
    if (!deferred) return;
    deferred.prompt();
    deferred.userChoice.finally(function(){ deferred = null; btn.hidden = true; });
  });
  addEventListener('appinstalled', function(){ btn.hidden = true; });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(function(){});
  // RSS の URL をコピー。クリップボードが使えなければ文字を選択して手でコピーしてもらう
  var input = document.getElementById('feed-url'), copy = document.getElementById('copy-feed');
  copy.addEventListener('click', function(){
    var label = copy.querySelector('span');
    function done(){ label.textContent = 'コピーしました'; setTimeout(function(){ label.textContent = 'コピー'; }, 2000); }
    function pick(){ input.focus(); input.select(); }
    if (navigator.clipboard) navigator.clipboard.writeText(input.value).then(done, pick); else pick();
  });
})();
</script>`
  return renderArticle({
    head: buildHeadMeta({
      title: '新着情報を受け取る | サンドーム福井ライブ情報',
      description: 'サンドーム福井の新しい公演と抽選の受付情報を、ホーム画面への追加やRSSで受け取る方法。',
      canonical,
    }),
    crumbs: [{ label: '公演一覧', href: '/' }, { label: '新着情報を受け取る' }],
    title: '新着情報を受け取る',
    lead: '新しい公演や抽選の受付情報を受け取る方法です。',
    body,
    extraHead: opts.turnstileSiteKey
      ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>'
      : undefined,
    extraScripts: script,
  })
}

import { escapeHtml } from '../lib/html'
import { iconSvg } from '../lib/icon'
import { buildHeadMeta } from '../lib/seo'
import { renderArticle } from './article'

/**
 * 「更新を受け取る」ページ。ヘッダーのベルから来る。RSS の XML を直接開くとファイルが保存されて
 * しまうので、ここで受け取り方を案内する。通知と SNS は仕組みができてから欄を足す(作りかけは出さない)
 */
export function renderSubscribePage(canonical: string): string {
  const feedUrl = new URL('/feed.xml', canonical).toString()
  const feedly = `https://feedly.com/i/subscription/feed%2F${encodeURIComponent(feedUrl)}`
  const body = `<section class="sub-block" id="install">
<h2>${iconSvg('add_to_home_screen')}ホーム画面に追加</h2>
<p>アプリのように、ホーム画面のアイコンからこのサイトを開けます。</p>
<p class="sub-installed" hidden>このサイトはホーム画面から開いています。</p>
<dl class="sub-steps">
<div><dt>iPhone</dt><dd>Safari で開き、画面下の共有ボタンから「ホーム画面に追加」を選びます。</dd></div>
<div><dt>Android</dt><dd>下のボタンを押すか、Chrome のメニューから「ホーム画面に追加」を選びます。</dd></div>
</dl>
<button class="sub-btn" type="button" id="install-btn" hidden>${iconSvg('add_to_home_screen')}ホーム画面に追加</button>
</section>

<section class="sub-block" id="rss">
<h2>${iconSvg('rss_feed')}RSS リーダーで読む</h2>
<p>新しい公演と、一般で申し込める抽選の受付開始を配信しています。Feedly や Inoreader などの RSS リーダーに、次の URL を登録してください。</p>
<div class="sub-url">
<input id="feed-url" type="text" readonly value="${escapeHtml(feedUrl)}" aria-label="RSS の URL">
<button class="sub-copy" type="button" id="copy-feed">${iconSvg('content_copy')}<span>コピー</span></button>
</div>
<p class="sub-links"><a class="btn-text" href="${escapeHtml(feedly)}" rel="noopener" target="_blank">Feedly で開く${iconSvg('open_in_new')}</a></p>
<p>Slack に流すときは、ワークスペースに RSS アプリを追加し、流したいチャンネルで <code>/feed subscribe ${escapeHtml(feedUrl)}</code> と送ります。</p>
</section>`
  const script = `<script>
(function(){
  // ホーム画面から開いているときは追加の案内を畳む
  var standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone) {
    document.querySelector('#install .sub-steps').hidden = true;
    document.querySelector('#install .sub-installed').hidden = false;
  }
  // Android の Chrome などがインストールを申し出たときだけボタンを出す
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
      title: '更新を受け取る | サンドーム福井ライブ情報',
      description: 'サンドーム福井の新しい公演と抽選の受付開始を、ホーム画面への追加や RSS で受け取る方法。',
      canonical,
    }),
    crumbs: [{ label: '公演一覧', href: '/' }, { label: '更新を受け取る' }],
    title: '更新を受け取る',
    lead: '新しい公演や抽選の受付が始まったことを、サイトを見に来なくても知るための方法です。',
    body,
    extraScripts: script,
  })
}

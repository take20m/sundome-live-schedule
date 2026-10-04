import { escapeHtml } from '../lib/html'

/**
 * ブラウザ側のプッシュ通知の共通処理(docs/web-push.md)。window.sundomePush として
 * 状態の判定・登録・解除を提供し、/subscribe の欄とホーム画面から開いたときのトーストの両方が使う。
 * 状態: unsupported(非対応) / ios-install(iPhone でホーム画面に追加していない) / denied(拒否済み) / subscribed / ready
 */
export function pushClientScript(vapidPublicKey: string): string {
  return `<script>
(function(){
  var KEY = ${JSON.stringify(escapeHtml(vapidPublicKey))};
  var ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function standalone(){ return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
  function supported(){ return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
  function keyBytes(){
    var s = KEY.replace(/-/g, '+').replace(/_/g, '/'); s += '='.repeat((4 - s.length % 4) % 4);
    var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u;
  }
  var reg = 'serviceWorker' in navigator ? navigator.serviceWorker.register('/sw.js').then(function(){ return navigator.serviceWorker.ready; }) : null;
  function post(path, body){ return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  window.sundomePush = {
    standalone: standalone,
    state: function(){
      if (!supported()) return Promise.resolve(ios && !standalone() ? 'ios-install' : 'unsupported');
      if (Notification.permission === 'denied') return Promise.resolve('denied');
      return reg.then(function(r){ return r.pushManager.getSubscription(); }).then(function(s){ return s ? 'subscribed' : 'ready'; })
        .catch(function(){ return 'unsupported'; });
    },
    // 許可を求めて登録する(ボタンを押したときに呼ぶ。ブラウザは操作なしの許可の要求を拒む)
    subscribe: function(){
      return Notification.requestPermission().then(function(p){
        if (p !== 'granted') throw new Error(p);
        return reg;
      }).then(function(r){
        return r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes() });
      }).then(function(s){
        return post('/api/push/subscribe', s.toJSON()).then(function(res){ if (!res.ok) throw new Error('save'); return true; });
      });
    },
    unsubscribe: function(){
      return reg.then(function(r){ return r.pushManager.getSubscription(); }).then(function(s){
        if (!s) return true;
        var endpoint = s.endpoint;
        return s.unsubscribe().then(function(){ return post('/api/push/unsubscribe', { endpoint: endpoint }); }).then(function(){ return true; });
      });
    }
  };
})();
</script>`
}

/** /subscribe のいちばん上の「通知で受け取る」欄(状態に合わせて中身を切り替える) */
export const PUSH_SECTION_SCRIPT = `<script>
(function(){
  var sec = document.getElementById('push'); if (!sec || !window.sundomePush) return;
  var on = document.getElementById('push-on'), off = document.getElementById('push-off'), msg = document.getElementById('push-msg');
  var TEXT = {
    'ios-install': 'iPhone では、このサイトをホーム画面に追加し、ホーム画面のアイコンから開くと通知を受け取れます。手順は下の「ホーム画面に追加」にあります。',
    unsupported: 'このブラウザは通知に対応していません。メールでの受け取りをお使いください。',
    denied: '通知がブロックされています。ブラウザ(iPhone は設定アプリ)でこのサイトの通知を許可してから、もう一度開いてください。',
    subscribed: 'この端末に通知します。',
    failed: '通知をオンにできませんでした。時間をおいてもう一度お試しください。'
  };
  function show(state){
    on.hidden = state !== 'ready';
    off.hidden = state !== 'subscribed';
    msg.hidden = state === 'ready';
    msg.textContent = TEXT[state] || '';
  }
  sec.hidden = false;
  sundomePush.state().then(show);
  on.addEventListener('click', function(){
    on.disabled = true;
    sundomePush.subscribe().then(function(){ show('subscribed'); }, function(){ sundomePush.state().then(function(s){ show(s === 'ready' ? 'failed' : s); }); })
      .then(function(){ on.disabled = false; });
  });
  off.addEventListener('click', function(){
    off.disabled = true;
    sundomePush.unsubscribe().then(function(){ show('ready'); }).then(function(){ off.disabled = false; });
  });
})();
</script>`

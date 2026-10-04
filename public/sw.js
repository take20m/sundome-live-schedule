// ホーム画面への追加と、プッシュ通知(docs/web-push.md)のためのサービスワーカー。
// ページは端末に保存しない(古い公演情報を見せないため、通信はすべてそのままサーバーへ行く)
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// 毎日の新着まとめ。中身は { title, body, url }
self.addEventListener('push', (event) => {
  let d = {}
  try {
    d = event.data ? event.data.json() : {}
  } catch (_) {}
  event.waitUntil(
    self.registration.showNotification(d.title || 'サンドーム福井ライブ情報', {
      body: d.body || '新着情報があります',
      icon: '/icon-192.png',
      badge: '/favicon-48.png',
      lang: 'ja',
      data: { url: d.url || '/' },
    }),
  )
})

// 通知を押したら、開いているタブがあればそこで、無ければ新しく開く
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin)
  if (url.origin !== self.location.origin) return
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c && 'navigate' in c) return c.navigate(url.href).then((w) => (w || c).focus())
      }
      return self.clients.openWindow(url.href)
    }),
  )
})

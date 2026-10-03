// ホーム画面に追加するためのサービスワーカー。ページは端末に保存しない(古い公演情報を見せないため、
// 通信はすべてそのままサーバーへ行く)。プッシュ通知を入れるときに push / notificationclick を足す
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

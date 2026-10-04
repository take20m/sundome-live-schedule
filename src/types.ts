export type Bindings = {
  DB: D1Database
  INGEST_TOKEN: string
  /** メール購読(docs/email-digest.md)。どれかが無ければメールの欄を出さず、送信もしない */
  RESEND_API_KEY?: string
  TURNSTILE_SECRET?: string
  /** Turnstile のサイトキー(公開値なので wrangler.toml の vars) */
  TURNSTILE_SITE_KEY?: string
  /** プッシュ通知(docs/web-push.md)の VAPID 鍵。公開鍵は vars、秘密鍵は secret。どちらか無ければ通知は出さない */
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY?: string
}

export type Confidence = 'official' | 'inferred'

export type EventRow = {
  id: string
  title: string
  artist: string
  date: string
  open_time: string | null
  start_time: string | null
  source_url: string | null
  artist_url: string | null
  tour_url: string | null
  image_url: string | null
  /** 一覧サムネの切り出し中心(CSS object-position)。未設定なら中央 */
  image_focus?: string | null
  /** サムネの見せ方。cover(切る) / contain(縮めて収める)。未設定は cover */
  image_fit?: string | null
  /** contain の余白の色 #RRGGBB */
  image_bg?: string | null
  /** 拡大率 1〜3 */
  image_zoom?: number | null
  confidence: Confidence
  updated_at: string
}

export type LotteryRow = {
  id: string
  event_id: string
  name: string
  starts_at: string | null
  ends_at: string | null
  url: string | null
  confidence: Confidence
  sold_out: number // 0 | 1
  missed_count: number
  updated_at: string
}

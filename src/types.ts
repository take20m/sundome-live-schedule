export type Bindings = {
  DB: D1Database
  INGEST_TOKEN: string
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

import type { LotteryRow } from '../types'

export type LotteryStatus = 'open' | 'upcoming' | 'closed' | 'soldout' | 'unknown'

/** 表示側とレポートAPIの両方で使うため lib に置く */
export function lotteryStatus(l: LotteryRow, now: Date): LotteryStatus {
  // 期間内でも先着販売の予定枚数終了などは受付不可
  if (l.sold_out === 1) return 'soldout'
  const starts = l.starts_at ? new Date(l.starts_at) : null
  const ends = l.ends_at ? new Date(l.ends_at) : null
  if (starts && now < starts) return 'upcoming'
  if (ends && now > ends) return 'closed'
  if (starts || ends) return 'open'
  return 'unknown'
}

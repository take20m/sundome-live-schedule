/**
 * 一覧サムネの見せ方。画像そのものは保存せず(著作物のコピーを持たない)、見せ方の数値だけを DB に持つ。
 * - focus: 切り出し中心(CSS の object-position)。「横% 縦%」
 * - fit:   cover(枠いっぱいに切る) / contain(全体を縮めて収める)
 * - bg:    contain の余白の色。無地の背景のロゴ画像なら、背景と同じ色で継ぎ目が見えない
 * - zoom:  拡大率(1〜3)。上下の黒帯を枠の外へ出すなど。拡大の中心は focus
 */
export const FOCUS_RE = /^(100|[1-9]?\d)% (100|[1-9]?\d)%$/
export const BG_RE = /^#[0-9A-Fa-f]{6}$/
export const FITS = ['cover', 'contain'] as const
export type Fit = (typeof FITS)[number]

export function safeFocus(v: string | null | undefined): string | null {
  return typeof v === 'string' && FOCUS_RE.test(v) ? v : null
}
export function safeFit(v: string | null | undefined): Fit | null {
  return typeof v === 'string' && (FITS as readonly string[]).includes(v) ? (v as Fit) : null
}
export function safeBg(v: string | null | undefined): string | null {
  return typeof v === 'string' && BG_RE.test(v) ? v : null
}
export function safeZoom(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 3 ? Math.round(v * 100) / 100 : null
}

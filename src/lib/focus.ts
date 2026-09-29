/**
 * 一覧サムネの切り出し中心(CSS の object-position)。「横% 縦%」の形だけを有効とする。
 * 画像そのものは保存せず(著作物のコピーを持たない)、この位置だけを DB に持つ
 */
export const FOCUS_RE = /^(100|[1-9]?\d)% (100|[1-9]?\d)%$/

export function safeFocus(v: string | null | undefined): string | null {
  return typeof v === 'string' && FOCUS_RE.test(v) ? v : null
}

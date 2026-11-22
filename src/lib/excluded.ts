/**
 * 表示もチケット情報の収集もしない公演。会場公式の一覧には載るが、運営者がこのサイトの対象外と決めたもの。
 *
 * 収集(LLM)の判断は夜ごとに揺れるので、取り込みで公演名を見て捨てる。
 * 公演名は空白(全角を含む)を除いて比べる。年ごとに付く「2027」などの違いは部分一致で吸収する。
 */
export const EXCLUDED_TITLE_TERMS: readonly string[] = [
  // 会場主催の子ども向けショー(2026-11 運営者判断)
  'サンドーム福井クリスマスショー',
]

const normalize = (s: string) => s.normalize('NFKC').replace(/\s/g, '')

/** 対象外の公演か */
export function isExcludedEvent(title: string): boolean {
  const t = normalize(title)
  return EXCLUDED_TITLE_TERMS.some((term) => t.includes(normalize(term)))
}

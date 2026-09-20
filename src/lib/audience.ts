/**
 * 抽選・先行の名前から「会員資格や CD 購入なしでは申し込めない受付」かを判定する。
 *
 * トップの「販売中のチケット」欄は、通りすがりの人が今すぐ申し込めるものだけを載せたい。
 * FC 限定・有料会員限定・CD 封入シリアル限定は、その資格がない人には締切カウントダウンを
 * 見せても意味がない。公演カードや詳細ページの抽選リストには全件出す(FC 会員には価値がある)。
 *
 * 収集データには種別カラムがなく名前(自由文)しかないため、名前に含まれる語で判定する。
 * ここに載せる語は実データ(D1 の lotteries.name)で確認したものに限る。
 * 一般語で拾えない事業者固有の会員制度名(LDH 系など)も、実データで見つけたら人間が確認して足す。
 */

/** 抽選名に含まれていたら資格限定とみなす語(大文字小文字は区別しない) */
export const RESTRICTED_TERMS: readonly string[] = [
  // ファンクラブ
  'FC',
  'ファンクラブ',
  'FAN CLUB',
  // 有料・登録会員
  '会員',
  'member',
  'mobile',
  'モバイル',
  // CD 購入者向け
  'CD',
  '封入',
  'シリアル',
  // 「〜限定」(NF member深海限定 / CD予約購入者限定 など)
  '限定',
  // LDH 系の会員制度(EXILE TRIBE CARD / LDH LIVE SQUARE / EXILE ch プレミアム)
  'TRIBE CARD',
  'LIVE SQUARE',
  'EXILE ch',
]

/** 会員資格や CD 購入が必要で、誰でも申し込めるわけではない受付か */
export function isRestrictedLottery(name: string): boolean {
  const upper = name.toUpperCase()
  return RESTRICTED_TERMS.some((term) => upper.includes(term.toUpperCase()))
}

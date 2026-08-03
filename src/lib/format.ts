/** ISO 8601 → "M/D HH:MM"(JST)。パース不能ならそのまま返す */
export function formatJst(iso: string | null): string {
  if (!iso) return '不明'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  const mm = jst.getUTCMonth() + 1
  const dd = jst.getUTCDate()
  const hh = String(jst.getUTCHours()).padStart(2, '0')
  const mi = String(jst.getUTCMinutes()).padStart(2, '0')
  return `${mm}/${dd} ${hh}:${mi}`
}

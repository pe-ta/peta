/** Visual length in full-width units: ASCII and half-width kana count as 0.5. */
export function fullWidthLength(s: string) {
  let n = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    n += cp < 0x2e80 || (cp >= 0xff61 && cp <= 0xff9f) ? 0.5 : 1;
  }
  return Math.round(n * 10) / 10;
}

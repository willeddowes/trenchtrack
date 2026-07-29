/** 20 -> "20th", 1 -> "1st", 22 -> "22nd", 13 -> "13th" (the 11-13 range is
 * always "th", not "st"/"nd"/"rd" -- the classic ordinal-suffix exception). */
export function ordinal(n: number): string {
  const remainder100 = n % 100;
  if (remainder100 >= 11 && remainder100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

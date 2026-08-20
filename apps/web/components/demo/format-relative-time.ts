const RTF = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const UNITS: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
];

/** Server-rendered once per request (the dashboard is already `force-dynamic`) — no
 * client-side ticking clock for a demo page. */
export function formatRelativeTime(date: Date): string {
  const diffSeconds = (date.getTime() - Date.now()) / 1000;
  const absSeconds = Math.abs(diffSeconds);

  if (absSeconds < 45) {
    return "just now";
  }

  for (const [unit, secondsInUnit] of UNITS) {
    if (absSeconds >= secondsInUnit) {
      return RTF.format(Math.round(diffSeconds / secondsInUnit), unit);
    }
  }

  return RTF.format(Math.round(diffSeconds), "second");
}

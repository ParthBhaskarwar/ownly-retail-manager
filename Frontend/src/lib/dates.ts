/**
 * Today's date as YYYY-MM-DD in the user's LOCAL time zone.
 *
 * The API wants a plain date. `new Date().toISOString()` is UTC, so for a shop in
 * India just after midnight it would stamp stock with yesterday's date (and, if the
 * time part is left on, the server rejects it outright).
 */
export function todayLocalISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

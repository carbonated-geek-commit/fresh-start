/**
 * Calendar-day arithmetic for the engine.
 *
 * CLAUDE.md section 10: "Ramp and payout logic is a pure function: no I/O, no
 * database, no clock. Time and state are passed in." Nothing in this module
 * reads the clock. `Date` is used only as a fixed-point calculator over an
 * explicit day string, never as a source of "now".
 *
 * A `DayKey` is a local calendar date, `YYYY-MM-DD`. SPEC 05 section 5.1 keeps
 * `for_date` (a calendar day, in the user's own timezone) strictly separate
 * from `logged_at` (a server instant). Conflating them is the bug this type
 * exists to prevent.
 */

export type DayKey = string & { readonly __brand?: 'DayKey' }

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MS_PER_DAY = 86_400_000

export function isDayKey(value: unknown): value is DayKey {
  if (typeof value !== 'string' || !DAY_PATTERN.test(value)) return false
  return toDayKey(new Date(`${value}T00:00:00Z`)) === value
}

export function assertDayKey(value: unknown): DayKey {
  if (!isDayKey(value)) throw new TypeError(`Not a calendar day key: ${JSON.stringify(value)}`)
  return value
}

/** UTC-slice a Date into a day key. Callers supply a date already shifted into
 * the user's zone; this function does not guess a timezone. */
export function toDayKey(date: Date): DayKey {
  return date.toISOString().slice(0, 10) as DayKey
}

function toUtcMillis(day: DayKey): number {
  return Date.parse(`${day}T00:00:00Z`)
}

export function addDays(day: DayKey, delta: number): DayKey {
  return toDayKey(new Date(toUtcMillis(day) + delta * MS_PER_DAY))
}

export const nextDay = (day: DayKey): DayKey => addDays(day, 1)
export const previousDay = (day: DayKey): DayKey => addDays(day, -1)

/** Whole days from `from` to `to`. Negative when `to` precedes `from`. */
export function daysBetween(from: DayKey, to: DayKey): number {
  return Math.round((toUtcMillis(to) - toUtcMillis(from)) / MS_PER_DAY)
}

export const compareDays = (a: DayKey, b: DayKey): number => (a < b ? -1 : a > b ? 1 : 0)

/** Inclusive of `start`, exclusive of `start + length`. */
export function dayRange(start: DayKey, length: number): DayKey[] {
  const out: DayKey[] = []
  for (let i = 0; i < length; i++) out.push(addDays(start, i))
  return out
}

/**
 * Resolve a wall-clock instant to the calendar day in a named IANA timezone.
 * Used at the API boundary to derive a user's "today" — never inside the
 * engine, which receives the day already resolved.
 */
export function dayKeyInZone(instant: Date, timeZone: string): DayKey {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)
  return parts as DayKey
}

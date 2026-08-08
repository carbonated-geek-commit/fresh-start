/**
 * SPEC 02 section 2.6 — the presentation boundary.
 *
 * "Minor units convert to display only at the presentation boundary. No stored
 * value is ever a decimal."
 *
 * This is the ONLY module permitted to turn a minor-unit integer into
 * something with a decimal point in it, and it returns a string, never a
 * number, so a converted value cannot flow back into arithmetic.
 */

/**
 * v1 is points only (thesis, v1 scope). `currency` exists in the type because
 * SPEC 07 section 7.2 requires `stake_kind` on `commitment_created` so points
 * versus currency completion is computable later — not because a rail exists.
 */
export type StakeKind = 'points' | 'currency'

export interface DisplayOptions {
  readonly kind?: StakeKind
  /** ISO 4217, used only when kind is 'currency'. Unused in v1. */
  readonly currency?: string
  readonly locale?: string
}

/** Points are whole units; currency is hundredths. SPEC 02 section 2.1. */
export function minorPerUnit(kind: StakeKind): number {
  return kind === 'points' ? 1 : 100
}

/**
 * Render a minor-unit integer for display.
 *
 *   formatMinor(10000, { kind: 'points' })    -> "10,000 pts"
 *   formatMinor(10000, { kind: 'currency' })  -> "$100.00"
 */
export function formatMinor(minor: number, options: DisplayOptions = {}): string {
  const kind = options.kind ?? 'points'
  const locale = options.locale ?? 'en-US'

  if (kind === 'points') {
    return `${new Intl.NumberFormat(locale).format(minor)} pts`
  }
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: options.currency ?? 'USD',
  }).format(minor / 100)
}

/** Bare number for display, without the unit suffix. */
export function formatMinorBare(minor: number, options: DisplayOptions = {}): string {
  const kind = options.kind ?? 'points'
  const locale = options.locale ?? 'en-US'
  if (kind === 'points') return new Intl.NumberFormat(locale).format(minor)
  return (minor / 100).toFixed(2)
}

/** Integer percentage of target, floored. Used by progress surfaces. */
export function percentOfTarget(accruedMinor: number, targetMinor: number): number {
  if (targetMinor <= 0) return 0
  return Math.floor((accruedMinor * 100) / targetMinor)
}

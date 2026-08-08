/**
 * Exact rational arithmetic over BigInt.
 *
 * SPEC 02 section 2.1: "Intermediate division uses an exact rational type.
 * Never a binary float." This module is that type. It exists so the ramp can
 * divide without ever materialising an IEEE-754 value.
 *
 * Nothing here reads a clock, performs I/O, or consults randomness.
 */

export interface Rational {
  readonly n: bigint // numerator, carries the sign
  readonly d: bigint // denominator, always > 0
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a
  let y = b < 0n ? -b : b
  while (y) {
    const t = x % y
    x = y
    y = t
  }
  return x
}

export function rational(n: bigint | number, d: bigint | number = 1n): Rational {
  let nn = BigInt(n)
  let dd = BigInt(d)
  if (dd === 0n) throw new RangeError('rational: zero denominator')
  if (dd < 0n) {
    nn = -nn
    dd = -dd
  }
  const g = gcd(nn, dd)
  return g > 1n ? { n: nn / g, d: dd / g } : { n: nn, d: dd }
}

/**
 * Build an exact rational from a JS number without inheriting its binary
 * error. Routed through the shortest round-tripping decimal string, so 0.05
 * becomes exactly 1/20 rather than 3602879701896397/72057594037927936.
 */
export function rationalFromNumber(value: number): Rational {
  if (!Number.isFinite(value)) throw new RangeError(`rationalFromNumber: ${value} is not finite`)
  return rationalFromDecimalString(String(value))
}

/** Parse an exact decimal literal, e.g. "0.05", "-1.25", "3", "1e-2". */
export function rationalFromDecimalString(text: string): Rational {
  const s = text.trim()
  const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(s)
  if (!m || (m[2] === '' && (m[3] ?? '') === '')) {
    throw new RangeError(`rationalFromDecimalString: cannot parse ${JSON.stringify(text)}`)
  }
  const sign = m[1] === '-' ? -1n : 1n
  const intPart = m[2] === '' ? '0' : (m[2] as string)
  const fracPart = m[3] ?? ''
  const exp = m[4] ? Number(m[4]) : 0

  let n = BigInt(intPart + fracPart) * sign
  let d = 10n ** BigInt(fracPart.length)
  if (exp > 0) n *= 10n ** BigInt(exp)
  else if (exp < 0) d *= 10n ** BigInt(-exp)
  return rational(n, d)
}

export const add = (a: Rational, b: Rational): Rational => rational(a.n * b.d + b.n * a.d, a.d * b.d)
export const sub = (a: Rational, b: Rational): Rational => rational(a.n * b.d - b.n * a.d, a.d * b.d)
export const mul = (a: Rational, b: Rational): Rational => rational(a.n * b.n, a.d * b.d)
export const div = (a: Rational, b: Rational): Rational => {
  if (b.n === 0n) throw new RangeError('rational: division by zero')
  return rational(a.n * b.d, a.d * b.n)
}
export const cmp = (a: Rational, b: Rational): number => {
  const l = a.n * b.d
  const r = b.n * a.d
  return l < r ? -1 : l > r ? 1 : 0
}
export const isZero = (a: Rational): boolean => a.n === 0n
export const isNegative = (a: Rational): boolean => a.n < 0n

/**
 * Round half away from zero. SPEC 02 section 2.2 specifies half-up; for the
 * non-negative values the ramp produces the two are identical, and defining
 * the negative case keeps the function total rather than surprising.
 */
export function roundHalfUp(r: Rational): bigint {
  const { n, d } = r
  return n >= 0n ? (2n * n + d) / (2n * d) : -((-2n * n + d) / (2n * d))
}

export const toStringExact = (r: Rational): string => (r.d === 1n ? `${r.n}` : `${r.n}/${r.d}`)

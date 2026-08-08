/**
 * SPEC 04 section 4.4 — the settlement interface. v1 stub.
 *
 * Four invariants meet in this one small module:
 *
 *   - **N1** — the destination enum is `user | charity`. There is no company
 *     value, and none may be added. Company revenue cannot depend on a user
 *     failing because there is nowhere for a shortfall to go that benefits the
 *     company.
 *   - **N2** — no payment rail, no provider SDK, no credential. The rail
 *     behind this interface is a stub that records a decision and moves
 *     nothing. Absence of the credential is the enforcement.
 *   - **N5** — settlement resolves *only* on an explicit user action. There is
 *     no timer, no default, no scheduled job, and no function here that can be
 *     called without a `userActionAt` the caller had to obtain from a real
 *     interaction.
 *   - **N3** — the returned amount is floored at zero and capped at accrued.
 *
 * "The stub must be a clean seam: swapping in a real rail later must not
 * require changing the commitment or accrual model." The seam is
 * `SettlementRail`.
 */

import type { SettlementDestination } from '@/engine/streak/types'

export type { SettlementDestination }

/** SPEC 04 section 4.4. `user` and `charity` only — N1. */
export const SETTLEMENT_DESTINATIONS: readonly SettlementDestination[] = ['user', 'charity']

export interface SettlementRequest {
  readonly commitmentId: string
  readonly userId: string
  readonly accruedMinor: number
  readonly targetMinor: number
  readonly destination: SettlementDestination
  /**
   * The instant the user made the choice. Required, and it is the structural
   * form of N5: a caller with no user action has no value to put here.
   */
  readonly userActionAt: Date
}

export interface SettlementResult {
  readonly commitmentId: string
  readonly destination: SettlementDestination
  /** Value returned to `success_destination`. Never negative (N3). */
  readonly settledMinor: number
  /** Target minus accrued, floored at zero. Routed per the user's choice. */
  readonly shortfallMinor: number
  readonly reachedTarget: boolean
  readonly userActionAt: string
  /** v1 is always `points_stub`. No money moved. */
  readonly rail: 'points_stub'
  /** Plain-language record of what actually happened. Shown to the user. */
  readonly summary: string
}

export class SettlementError extends Error {
  readonly userMessage: string
  constructor(userMessage: string) {
    super(userMessage)
    this.name = 'SettlementError'
    this.userMessage = userMessage
  }
}

/** The seam. A real rail implements this later; nothing above it changes. */
export interface SettlementRail {
  readonly id: string
  settle(request: SettlementRequest): Promise<SettlementResult>
}

function validate(request: SettlementRequest): void {
  if (!SETTLEMENT_DESTINATIONS.includes(request.destination)) {
    // Unreachable through the type system; kept because this is the boundary
    // where a hand-written payload or a future migration would arrive.
    throw new SettlementError('That is not a destination this app can send anything to.')
  }
  if (!Number.isInteger(request.accruedMinor) || request.accruedMinor < 0) {
    throw new SettlementError('Settlement amounts must be whole, non-negative units.')
  }
  if (!Number.isInteger(request.targetMinor) || request.targetMinor <= 0) {
    throw new SettlementError('Settlement amounts must be whole, non-negative units.')
  }
  if (request.accruedMinor > request.targetMinor) {
    // Accrual is capped at target (SPEC 01 section 1.4); exceeding it means
    // the caller computed it wrongly, and paying out on it would breach N4.
    throw new SettlementError('Accrued value exceeds the target. Refusing to settle.')
  }
}

/**
 * The v1 rail.
 *
 * "It records the user's settlement decision and returns a result. It performs
 * no charge, holds no balance, and integrates no payment provider."
 */
export const pointsStubRail: SettlementRail = {
  id: 'points_stub',

  async settle(request: SettlementRequest): Promise<SettlementResult> {
    validate(request)

    const settledMinor = Math.max(0, request.accruedMinor)
    const shortfallMinor = Math.max(0, request.targetMinor - request.accruedMinor)
    const reachedTarget = shortfallMinor === 0

    return {
      commitmentId: request.commitmentId,
      destination: request.destination,
      settledMinor,
      shortfallMinor,
      reachedTarget,
      userActionAt: request.userActionAt.toISOString(),
      rail: 'points_stub',
      summary: reachedTarget
        ? 'You reached the target. Everything you earned comes back to you.'
        : `You earned ${settledMinor} of ${request.targetMinor}. ` +
          `That is yours. The remaining ${shortfallMinor} goes where you chose.`,
    }
  },
}

/**
 * Settle a commitment.
 *
 * There is exactly one entry point, it takes the user's action instant, and
 * nothing in this repository calls it from a scheduler. Grep for callers to
 * verify N5 — that is the intended audit.
 */
export async function settle(
  request: SettlementRequest,
  rail: SettlementRail = pointsStubRail,
): Promise<SettlementResult> {
  return rail.settle(request)
}

/* ------------------------------------------------------------------------ */
/* Copy for the settlement surface                                           */
/* ------------------------------------------------------------------------ */

export interface DestinationOption {
  readonly id: SettlementDestination
  readonly label: string
  readonly description: string
}

/**
 * The choices offered at settlement.
 *
 * Note there are two, and neither is the company. Blueprint invariant N1 says
 * revenue must never depend on a user failing; the enum is where that is true.
 */
export function destinationOptions(shortfallMinor: number): DestinationOption[] {
  return [
    {
      id: 'user',
      label: 'Back to me',
      description:
        shortfallMinor > 0
          ? 'Keep the shortfall. This is always available, and choosing it is not a failure.'
          : 'Everything you earned returns to you.',
    },
    {
      id: 'charity',
      label: 'To a cause',
      description:
        'Send the shortfall somewhere you would rather it went. In this version nothing moves — ' +
        'we record the choice.',
    },
  ]
}

/**
 * The settlement prompt.
 *
 * SPEC 05 section 5.5 governs this copy, and blueprint section 4 governs its
 * stance: credit the behaviour they controlled. A user who fell short still
 * did the days they did.
 */
export function settlementPrompt(accruedMinor: number, targetMinor: number, daysCompleted: number): {
  headline: string
  body: string
} {
  if (accruedMinor >= targetMinor) {
    return {
      headline: 'You did the whole thing.',
      body: `${daysCompleted} days. The full target is yours — tell us where it goes.`,
    }
  }
  return {
    headline: `${daysCompleted} days done.`,
    body:
      'The window is up. What you earned is yours either way — the only thing to decide is ' +
      'where the rest goes, and keeping it is a real answer.',
  }
}

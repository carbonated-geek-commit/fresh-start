import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/auth'
import { resolveStore } from '@/data'
import { formatMinor } from '@/engine/ramp'
import { recoveriesIn } from '@/engine/recovery'
import { loadDashboard } from '@/services/habit-service'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

/**
 * ADR-003 — the month-end artifact.
 *
 * Blueprint v0.4 section 4.5: "Produce something that persists — a record of
 * what they actually did. The fresh start, made visible."
 *
 * **Owner-only, by design.** The blueprint calls this "the natural referral
 * surface", which points at a public link — and a public URL carrying a
 * completion record is an outbound path for behavioural data, which N9
 * forbids. So it sits behind the same session and RLS as everything else, and
 * is built to be screenshotted or printed: the user shares it, through a
 * channel they chose, by an action they took.
 */
export const metadata: Metadata = {
  title: 'Your record — FreshStart',
  // Not that a crawler could reach it — there is no unauthenticated route —
  // but stating the intent costs nothing.
  robots: { index: false, follow: false },
}

export default async function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSession()
  if (!session) redirect('/start')

  const store = resolveStore(session.accessToken)
  const dashboard = await loadDashboard(store, session)
  const view = dashboard.commitments.find((c) => c.commitment.id === id)
  if (!view) notFound()

  const completed = view.slots.filter((s) => s.status === 'completed').length
  const missed = view.slots.filter((s) => s.status === 'missed').length
  const elapsed = view.slots.filter((s) => s.status !== 'future').length
  const returns = recoveriesIn(view.replay.transitions).length
  const reached = view.state.accruedMinor >= view.commitment.stakeTargetMinor

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <Link href={`/habit/${id}`} className="text-ink-soft text-xs underline underline-offset-4">
          Back
        </Link>
        <p className="text-ink-faint text-xs">Screenshot it, or print to PDF.</p>
      </div>

      {/* The artifact itself. Everything below prints; nothing else does. */}
      <article className="card overflow-hidden">
        <div className="bg-accent-soft px-5 py-6">
          <p className="text-ink-faint text-[0.65rem] font-medium tracking-[0.2em] uppercase">
            FreshStart · {view.commitment.windowStart} to {view.replay.windowEnd}
          </p>
          <h1 className="display mt-2 text-3xl leading-tight">{view.habit.label}</h1>
          {view.habit.motivatingOutcome ? (
            <p className="text-ink-soft mt-2 text-sm leading-relaxed">
              Because: {view.habit.motivatingOutcome}
            </p>
          ) : null}
        </div>

        <div className="px-5 py-6">
          {/*
            The headline credits the behaviour, not the outcome (thesis,
            success principle). A shortfall is never framed as a failure —
            a user who did 19 of 30 days did 19 days, and that is the fact.
          */}
          <p className="display text-4xl leading-none">
            {completed}
            <span className="text-ink-faint text-xl"> / {elapsed} days</span>
          </p>
          <p className="text-ink-soft mt-2 text-sm leading-relaxed">
            {reached
              ? 'You reached the target you set yourself.'
              : completed === 0
                ? 'This window did not happen. It is still a record, and the next one starts whenever you say.'
                : `You showed up ${completed} ${completed === 1 ? 'time' : 'times'}. Every one of those was a decision you made.`}
          </p>

          <div className="mt-6 grid grid-cols-3 gap-3 text-center">
            <Figure label="Earned" value={formatMinor(view.state.accruedMinor)} />
            <Figure label="Longest run" value={`${view.state.bestPosition} days`} />
            <Figure
              label="Came back"
              value={missed === 0 ? 'never missed' : `${returns} of ${missed}`}
            />
          </div>

          <div className="mt-6">
            <p className="text-ink-faint mb-2 text-[0.65rem] font-medium tracking-widest uppercase">
              Day by day
            </p>
            <ol className="grid grid-cols-10 gap-1">
              {view.slots
                .filter((slot) => slot.status !== 'future')
                .map((slot, index) => (
                  <li key={slot.day}>
                    <span
                      title={`${slot.day}`}
                      className={`block aspect-square rounded-sm ${
                        slot.status === 'completed'
                          ? 'bg-hold'
                          : slot.status === 'grace'
                            ? 'bg-grace'
                            : 'bg-rest'
                      }`}
                    >
                      <span className="sr-only">{`Day ${index + 1}: ${slot.status}`}</span>
                    </span>
                  </li>
                ))}
            </ol>
          </div>

          {returns > 0 ? (
            <p className="text-ink-soft mt-5 text-sm leading-relaxed">
              You came back after a missed day {returns} {returns === 1 ? 'time' : 'times'}. That
              is the part that predicts whether a habit holds — more than a clean run does.
            </p>
          ) : null}
        </div>

        <p className="border-line text-ink-faint border-t px-5 py-3 text-[0.65rem]">
          A record of days actually logged. No device, no tracking — self-reported, and that is the
          whole verification.
        </p>
      </article>
    </>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-line rounded-xl border px-2 py-3">
      <p className="text-sm font-semibold">{value}</p>
      <p className="text-ink-faint mt-0.5 text-[0.65rem] tracking-wide uppercase">{label}</p>
    </div>
  )
}

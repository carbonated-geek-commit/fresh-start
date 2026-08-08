import { redirect } from 'next/navigation'
import { getSession } from '@/auth'
import { resolveStore } from '@/data'
import {
  completionRateBy,
  dayOfFirstMissDistribution,
  monthTwoContinuation,
  personalInsights,
  recoveryRateAfterFirstMiss,
} from '@/analytics/events'
import { loadDashboard } from '@/services/habit-service'
import { Card, EmptyState, LinkButton, Notice, PageTitle } from '@/ui/components'

export const dynamic = 'force-dynamic'

/**
 * SPEC 07 section 7.4 — give the analysis back to the user.
 *
 * "The same analysis runs on a single user's own data and is shown to them...
 *  This is the primary justification for holding the data at all and must be
 *  treated as a product feature, not an internal tool."
 *
 * So it is a tab, not a report someone else reads.
 */
export default async function InsightsPage() {
  const session = await getSession()
  if (!session) redirect('/start')

  const store = resolveStore(session.accessToken)
  const [dashboard, events] = await Promise.all([
    loadDashboard(store, session),
    store.listEvents(session.userId),
  ])

  const insights = personalInsights(events, { timeZone: dashboard.profile.timeZone })
  const recovery = recoveryRateAfterFirstMiss(events)
  const firstMiss = dayOfFirstMissDistribution(events)
  const byMode = completionRateBy(events, 'mode')
  const continuation = monthTwoContinuation(events)

  return (
    <>
      <PageTitle kicker="Your data, working for you">What your own days show</PageTitle>

      {insights.length === 0 ? (
        <EmptyState
          title="Not enough yet."
          body="A claim from four days of data is a coin flip in a nice font. Once there is enough here to say something honest, this is where it goes."
          action={<LinkButton href="/">Back to today</LinkButton>}
        />
      ) : (
        <div className="space-y-3">
          {insights.map((insight) => (
            <Card key={insight.headline}>
              <p className="display text-lg leading-snug">{insight.headline}</p>
              <p className="text-ink-soft mt-1.5 text-sm leading-relaxed">{insight.detail}</p>
              <p className="text-ink-faint mt-2 text-xs">
                From {insight.sampleSize} {insight.sampleSize === 1 ? 'day' : 'days'}.
              </p>
            </Card>
          ))}
        </div>
      )}

      {recovery.rate !== null || firstMiss.size > 0 || byMode.size > 0 ? (
        <Card className="mt-4">
          <p className="mb-3 text-sm font-medium">The numbers behind those</p>
          <dl className="space-y-2.5 text-sm">
            {recovery.rate !== null ? (
              <Row
                label="Came back after a first miss"
                value={`${recovery.numerator} of ${recovery.denominator}`}
                note="The number most predictive of whether a habit holds."
              />
            ) : null}
            {[...byMode.entries()].map(([mode, rate]) => (
              <Row
                key={mode}
                label={`Completion in ${mode} mode`}
                value={rate.rate === null ? '—' : `${Math.round(rate.rate * 100)}%`}
                note={`${rate.numerator} of ${rate.denominator} days`}
              />
            ))}
            {firstMiss.size > 0 ? (
              <Row
                label="Where the first miss lands"
                value={[...firstMiss.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3)
                  .map(([day, count]) => `day ${day + 1} (${count}×)`)
                  .join(', ')}
                note="Where a nudge would do the most good."
              />
            ) : null}
            {continuation.completedAWindow > 0 ? (
              <Row
                label="Kept going at a lower stake"
                value={`${continuation.continuedAtLowerStake} of ${continuation.completedAWindow}`}
                note="The honest test of whether this produced a habit or bought a month of compliance."
              />
            ) : null}
          </dl>
        </Card>
      ) : null}

      <div className="mt-4">
        <Notice title="Where this comes from">
          <p>
            Your own logs, and nothing else. These numbers are computed on this server from your
            events and shown only to you — there is no export, no third party, and no path in the
            code that sends behavioural data anywhere.
          </p>
        </Notice>
      </div>
    </>
  )
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-ink-faint">{label}</dt>
        <dd className="text-right font-medium">{value}</dd>
      </div>
      {note ? <p className="text-ink-faint mt-0.5 text-xs leading-relaxed">{note}</p> : null}
    </div>
  )
}

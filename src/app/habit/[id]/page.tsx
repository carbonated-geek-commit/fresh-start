import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/auth'
import { resolveStore } from '@/data'
import { formatMinor, rampValue } from '@/engine/ramp'
import { describeMode } from '@/engine/modes'
import { recoveriesIn } from '@/engine/recovery'
import { loadDashboard } from '@/services/habit-service'
import { Card, LinkButton, Notice, PageTitle, ValueBar, WindowStrip } from '@/ui/components'
import { LogControl } from '../../log-control'
import { DoubleControl, AbandonControl } from './controls'
import { PartnerPanel } from './partners'

export const dynamic = 'force-dynamic'

export default async function HabitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSession()
  if (!session) redirect('/start')

  const store = resolveStore(session.accessToken)
  const dashboard = await loadDashboard(store, session)
  const view = dashboard.commitments.find((c) => c.commitment.id === id)
  if (!view) notFound()

  const partners = await store.listPartners(session.userId, id)

  const mode = describeMode(view.commitment.mode)
  // Misses absorbed by a grace day are not something to come back from, so
  // they are excluded from the denominator (see `recoveryRate` in the engine).
  const misses = view.replay.transitions.filter((t) => !t.completed && !t.graceConsumed).length
  const returns = recoveriesIn(view.replay.transitions).length
  const remaining = view.slots.filter((s) => s.status === 'future').length

  return (
    <>
      <PageTitle kicker={mode.name}>{view.habit.label}</PageTitle>

      {view.habit.motivatingOutcome ? (
        <div className="mb-4">
          <Notice title="Why you said you are doing this">
            <p>{view.habit.motivatingOutcome}</p>
            <p className="mt-2 text-xs leading-relaxed">
              This is not staked and not scored. It is here so the habit keeps its point.
            </p>
          </Notice>
        </div>
      ) : null}

      <Card>
        <ValueBar
          accruedMinor={view.state.accruedMinor}
          targetMinor={view.commitment.stakeTargetMinor}
          percent={view.percentOfTarget}
        />
        <dl className="mt-4 grid grid-cols-2 gap-y-3 text-sm">
          <Stat label="Days done" value={String(view.daysCompleted)} />
          <Stat label="Days left in window" value={String(remaining)} />
          <Stat
            label="Current rung"
            value={`${view.state.position + 1} of ${view.commitment.streakTarget}`}
          />
          <Stat
            label="Today is worth"
            value={view.loggedToday ? '—' : formatMinor(view.pendingValueMinor)}
          />
          {misses > 0 ? (
            <Stat label="You came back" value={`${returns} of ${misses} times`} />
          ) : null}
          {view.state.graceRemaining > 0 ? <Stat label="Grace days left" value="1" /> : null}
        </dl>
      </Card>

      <Card className="mt-4">
        <p className="mb-3 text-sm font-medium">This window</p>
        <WindowStrip slots={view.slots} />
        <p className="text-ink-faint mt-3 text-xs leading-relaxed">
          {view.commitment.windowStart} onward · {view.commitment.windowDays} days
        </p>
      </Card>

      <Card className="mt-4">
        <p className="mb-2 text-sm font-medium">The ladder</p>
        <p className="text-ink-faint mb-3 text-xs leading-relaxed">
          Each rung is worth more than the last. That is why an inconsistent pattern runs out of
          calendar rather than being penalised — nothing is ever taken back.
        </p>
        <ol className="flex flex-wrap gap-1.5">
          {view.ramp.dayValuesMinor.map((value, index) => (
            <li
              key={index}
              className={`rounded-md px-2 py-1 text-xs tabular-nums ${
                index < view.state.position
                  ? 'bg-hold-soft text-ink'
                  : index === view.state.position
                    ? 'bg-accent text-white'
                    : 'border-line text-ink-faint border'
              }`}
            >
              {value}
            </li>
          ))}
        </ol>
        <p className="text-ink-faint mt-3 text-xs">
          Day one is {formatMinor(rampValue(view.ramp, 0))}; the last day is{' '}
          {formatMinor(rampValue(view.ramp, view.ramp.streakTarget - 1))}.
        </p>
      </Card>

      <Card className="mt-4">
        <LogControl
          commitmentId={view.commitment.id}
          loggableDays={[...view.loggableDays]}
          today={dashboard.today}
        />
      </Card>

      <div className="mt-4">
        <PartnerPanel
          commitmentId={view.commitment.id}
          partners={partners.map((partner) => ({
            email: partner.status === 'pending' ? partner.email : partner.displayName,
            role: partner.role,
            status: partner.status,
          }))}
        />
      </div>

      {view.doubleAvailable ? (
        <Card className="mt-4">
          <p className="display text-lg">You reached the streak.</p>
          <p className="text-ink-soft mt-1 text-sm leading-relaxed">
            The double is a separate commitment at twice the target, running the days left in this
            window. It does not touch this one, and skipping it costs you nothing.
          </p>
          <div className="mt-3">
            <DoubleControl commitmentId={view.commitment.id} />
          </div>
        </Card>
      ) : null}

      {view.awaitingSettlement ? (
        <div className="mt-4">
          <LinkButton href={`/settle/${view.commitment.id}`}>Settle this window</LinkButton>
        </div>
      ) : null}

      {view.settlement ? (
        <div className="mt-4">
          <Notice tone="hold" title="Settled">
            <p>
              {formatMinor(view.settlement.accruedMinor)} of{' '}
              {formatMinor(view.settlement.targetMinor)}, routed to{' '}
              {view.settlement.destination === 'user' ? 'you' : 'a cause'}. Nothing was charged —
              this version is points only.
            </p>
          </Notice>
        </div>
      ) : null}

      {/* ADR-003 — the month-end artifact, once there is a window to record. */}
      {view.replay.windowElapsed || view.settlement ? (
        <div className="mt-4">
          <LinkButton href={`/record/${view.commitment.id}`} variant="quiet">
            See your record
          </LinkButton>
        </div>
      ) : null}

      <div className="mt-8 space-y-3">
        <AbandonControl commitmentId={view.commitment.id} />
        <p className="text-ink-faint text-center text-xs">
          <Link href="/" className="underline underline-offset-4">
            Back to today
          </Link>
        </p>
      </div>
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ink-faint text-xs">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  )
}

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/auth'
import { resolveStore } from '@/data'
import { formatMinor } from '@/engine/ramp'
import { recoveryPrompt } from '@/engine/recovery'
import { loadDashboard, type CommitmentView } from '@/services/habit-service'
import { Card, EmptyState, LinkButton, LoadMeter, Notice, PageTitle, ValueBar, WindowStrip } from '@/ui/components'
import { CueStrip, leadNudge } from '@/ui/cue-strip'
import { LogControl } from './log-control'

export const dynamic = 'force-dynamic'

export default async function TodayPage() {
  const session = await getSession()
  if (!session) redirect('/start')

  const store = resolveStore(session.accessToken)
  const dashboard = await loadDashboard(store, session)

  const active = dashboard.commitments.filter((c) => c.commitment.status === 'active')
  const awaiting = dashboard.commitments.filter((c) => c.awaitingSettlement)

  // The strip already leads with one cue. Whichever commitment it names does
  // not repeat its recovery prompt on its own card two inches below.
  const now = new Date()
  const lead = leadNudge(dashboard.nudges, now)
  const cueShownFor = lead?.kind === 'recovery' ? lead.commitmentId : null

  return (
    <>
      <PageTitle kicker={dashboard.today}>
        {greeting(dashboard.profile.displayName, active)}
      </PageTitle>

      {active.length > 0 ? (
        <CueStrip nudges={dashboard.nudges} now={now} timeZone={dashboard.profile.timeZone} />
      ) : null}

      {awaiting.length > 0 ? (
        <div className="mb-4 space-y-3">
          {awaiting.map((view) => (
            <Notice key={view.commitment.id} tone="warm" title={`${view.habit.label} — window finished`}>
              <p>
                Nothing happens until you say so. Choose where it goes when you are ready.{' '}
                <Link className="underline underline-offset-4" href={`/settle/${view.commitment.id}`}>
                  Settle
                </Link>
              </p>
            </Notice>
          ))}
        </div>
      ) : null}

      {active.length === 0 ? (
        <EmptyState
          title="Nothing running yet."
          body="Start with one thing you could do tomorrow even if tomorrow goes badly. You can add more later — the app will tell you honestly when you are carrying a lot."
          action={<LinkButton href="/new">Set your first habit</LinkButton>}
        />
      ) : (
        <div className="space-y-4">
          {active.map((view) => (
            <HabitCard
              key={view.commitment.id}
              view={view}
              today={dashboard.today}
              suppressRecoveryNotice={view.commitment.id === cueShownFor}
            />
          ))}
        </div>
      )}

      <Card className="mt-6">
        <LoadMeter load={dashboard.load} />
        {dashboard.canAddMore ? (
          <div className="mt-4">
            <LinkButton href="/new" variant="quiet">
              Add another habit
            </LinkButton>
          </div>
        ) : (
          <p className="text-ink-soft mt-4 text-xs leading-relaxed">
            Five is the ceiling. Finish or step back from one before adding another.
          </p>
        )}
      </Card>

      {dashboard.commitments.some((c) => c.staircase) ? (
        <div className="mt-4 space-y-3">
          {dashboard.commitments
            .filter((c) => c.staircase)
            .map((c) => (
              <Notice key={c.commitment.id} tone="hold" title={c.staircase?.headline}>
                {c.staircase?.body}
              </Notice>
            ))}
        </div>
      ) : null}
    </>
  )
}

function greeting(name: string, active: readonly CommitmentView[]): string {
  const recovering = active.find((c) => c.isRecoveryDay)
  if (recovering) return `Today is still here, ${name}.`
  const pending = active.filter((c) => !c.loggedToday).length
  if (active.length === 0) return `Hello, ${name}.`
  if (pending === 0) return `All logged, ${name}.`
  return `${pending} to go, ${name}.`
}

function HabitCard({
  view,
  today,
  suppressRecoveryNotice = false,
}: {
  view: CommitmentView
  today: string
  suppressRecoveryNotice?: boolean
}) {
  const prompt =
    view.isRecoveryDay && !suppressRecoveryNotice ? recoveryPrompt(view.daysSinceMiss ?? 1) : null

  return (
    <Card as="article">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="display truncate text-xl">
            <Link href={`/habit/${view.commitment.id}`}>
              {view.habit.label}
              {/* A doubled commitment shares its habit's label. Left alone it
                  renders an h2 identical to its source, which is unreadable in
                  a heading list. */}
              {view.commitment.doubledFromCommitmentId ? (
                <span className="text-ink-faint"> · double</span>
              ) : null}
            </Link>
          </h2>
          <p className="text-ink-faint mt-0.5 text-xs">
            {view.commitment.mode === 'streak' ? 'Streak' : 'Consistency'} · day{' '}
            {view.state.position + 1} of {view.commitment.streakTarget}
            {view.state.graceRemaining > 0 ? ' · 1 grace day left' : ''}
          </p>
        </div>
        {!view.loggedToday ? (
          <span className="bg-accent-soft text-ink shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold">
            +{formatMinor(view.pendingValueMinor)}
          </span>
        ) : (
          <span className="bg-hold-soft text-ink shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold">
            done
          </span>
        )}
      </div>

      {/* SPEC 05 section 5.4 — the day after a miss is the most supported
          moment in the product, so it leads the card rather than sitting
          underneath the numbers. */}
      {prompt ? (
        <div className="mt-4">
          <Notice tone="warm" title={prompt.headline}>
            {prompt.body}
          </Notice>
        </div>
      ) : null}

      <div className="mt-4">
        <ValueBar
          accruedMinor={view.state.accruedMinor}
          targetMinor={view.commitment.stakeTargetMinor}
          percent={view.percentOfTarget}
        />
      </div>

      <div className="mt-4">
        <WindowStrip slots={view.slots} />
      </div>

      {view.doubleAvailable ? (
        <div className="mt-4">
          <Notice tone="hold" title="You hit the streak.">
            <p>
              A double is available — a new commitment at twice the target, running the rest of
              this window. Entirely optional.{' '}
              <Link className="underline underline-offset-4" href={`/habit/${view.commitment.id}`}>
                Look at it
              </Link>
            </p>
          </Notice>
        </div>
      ) : null}

      <div className="mt-4">
        <LogControl
          commitmentId={view.commitment.id}
          loggableDays={[...view.loggableDays]}
          today={today}
        />
      </div>
    </Card>
  )
}

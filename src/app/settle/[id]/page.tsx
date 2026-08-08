import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/auth'
import { resolveStore } from '@/data'
import { formatMinor } from '@/engine/ramp'
import { settlementView } from '@/services/habit-service'
import { Card, Notice, PageTitle } from '@/ui/components'
import { SettleForm } from './form'

export const dynamic = 'force-dynamic'

/**
 * The settlement surface — N5.
 *
 * There is no timer on this page, no countdown, and no default that resolves
 * itself. The window can sit here unresolved indefinitely; the only thing that
 * settles it is the user pressing the button.
 */
export default async function SettlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSession()
  if (!session) redirect('/start')

  const store = resolveStore(session.accessToken)
  const view = await settlementView(store, session, id)
  if (!view) notFound()

  const shortfall = Math.max(0, view.targetMinor - view.accruedMinor)

  return (
    <>
      <PageTitle kicker="Window finished">{view.prompt.headline}</PageTitle>

      <Card>
        <p className="text-ink-soft text-sm leading-relaxed">{view.prompt.body}</p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-faint">{view.habitLabel}</dt>
            <dd className="font-medium">{view.daysCompleted} days</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-faint">You earned</dt>
            <dd className="font-medium">{formatMinor(view.accruedMinor)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-faint">Target</dt>
            <dd className="font-medium">{formatMinor(view.targetMinor)}</dd>
          </div>
          {shortfall > 0 ? (
            <div className="border-line flex justify-between gap-3 border-t pt-2">
              <dt className="text-ink-faint">To route</dt>
              <dd className="font-semibold">{formatMinor(shortfall)}</dd>
            </div>
          ) : null}
        </dl>
      </Card>

      <div className="mt-4">
        <SettleForm
          commitmentId={view.commitmentId}
          options={view.options.map((option) => ({ ...option }))}
          currentChoice={view.currentChoice}
        />
      </div>

      <div className="mt-4">
        <Notice title="What happens when you press it">
          <p>
            We record your decision. Nothing is charged, nothing is held, and no payment provider
            is involved — this version is points only. Until you press it, nothing resolves: there
            is no timer and no default.
          </p>
        </Notice>
      </div>
    </>
  )
}

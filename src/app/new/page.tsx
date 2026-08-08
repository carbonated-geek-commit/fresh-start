import { redirect } from 'next/navigation'
import { getSession } from '@/auth'
import { resolveStore } from '@/data'
import { healthPlaybook } from '@/domains'
import { loadDashboard } from '@/services/habit-service'
import { addAnotherWarning } from '@/habits/load'
import { Card, Notice, PageTitle } from '@/ui/components'
import { NewHabitFlow } from './flow'

export const dynamic = 'force-dynamic'

export default async function NewHabitPage() {
  const session = await getSession()
  if (!session) redirect('/start')

  const store = resolveStore(session.accessToken)
  const dashboard = await loadDashboard(store, session)
  const live = dashboard.commitments.filter(
    (c) => c.commitment.status === 'active' || c.commitment.status === 'draft',
  ).length

  const warning = addAnotherWarning(live)

  return (
    <>
      <PageTitle kicker="New habit">What are you trying to change?</PageTitle>

      {warning ? (
        <div className="mb-4">
          <Notice tone="warm" title="Before you add another">
            {warning}
          </Notice>
        </div>
      ) : null}

      <NewHabitFlow
        starters={healthPlaybook.starterHabits.map((h) => ({
          label: h.label,
          sizeClass: h.sizeClass,
          rationale: h.rationale,
        }))}
      />

      <Card className="mt-6">
        <p className="text-ink-faint text-xs leading-relaxed">
          {healthPlaybook.honestyBox}
        </p>
      </Card>
    </>
  )
}

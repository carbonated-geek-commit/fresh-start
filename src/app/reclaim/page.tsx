import { redirect } from 'next/navigation'
import { getSession } from '@/auth'
import { resolveStore } from '@/data'
import { describeBrokerRitual, generateRecipes } from '@/cleanup'
import { healthPlaybook, ritualsInOrder } from '@/domains'
import { Card, Notice, PageTitle } from '@/ui/components'
import { RecipeToggle } from './recipe-toggle'

export const dynamic = 'force-dynamic'

/**
 * SPEC 08 section 8.3 — the ritual order, and SPEC 06 sections 6.4/6.5.
 *
 * "Reclaim — cleanup ritual. This is the *first habit*: the ceremonial act of
 *  reclaiming ground before rebuilding."
 *
 * Every string on this page passes `assertCleanupCopy` at generation time, so
 * N11's "freeze, suppress, take control" language is enforced rather than
 * reviewed.
 */
export default async function ReclaimPage() {
  const session = await getSession()
  if (!session) redirect('/start')

  const store = resolveStore(session.accessToken)
  const [habits, applied] = await Promise.all([
    store.listHabits(session.userId),
    store.listRecipes(session.userId),
  ])

  const goalText = habits
    .map((h) => `${h.label} ${h.motivatingOutcome ?? ''}`)
    .join('. ')
    .trim()

  const recipes = generateRecipes(goalText || 'build a morning habit')
  const appliedKeys = new Map(applied.map((r) => [r.recipeKey, r.applied]))
  const broker = describeBrokerRitual()
  const rituals = ritualsInOrder(healthPlaybook)

  return (
    <>
      <PageTitle kicker="Health playbook">Reclaim the ground first</PageTitle>

      <ol className="space-y-4">
        {rituals.map((ritual) => {
          const copy = healthPlaybook.copy[ritual.copyKey]
          if (!copy) return null
          return (
            <li key={ritual.copyKey}>
              <Card as="article">
                <p className="text-ink-faint text-xs tracking-widest uppercase">
                  Step {ritual.order}
                </p>
                <h2 className="display mt-1 text-lg leading-snug">{copy.headline}</h2>
                <p className="text-ink-soft mt-2 text-sm leading-relaxed">{copy.body}</p>
                <p className="text-ink mt-3 text-sm font-medium">{copy.action}</p>
              </Card>
            </li>
          )
        })}
      </ol>

      <h2 className="display mt-8 mb-1 text-xl">Rules to set, in your own accounts</h2>
      <p className="text-ink-faint mb-4 text-xs leading-relaxed">
        We write the recipe. You apply it yourself, in your own mail and phone settings. The app
        never connects to your inbox and never reads your messages — there is no code path that
        could.
      </p>

      <ul className="space-y-3">
        {recipes.map((recipe) => (
          <li key={recipe.id}>
            <Card as="article">
              <h3 className="text-sm font-semibold">{recipe.title}</h3>
              <p className="text-ink-soft mt-1 text-xs leading-relaxed">{recipe.rationale}</p>
              <ol className="text-ink-soft mt-3 list-decimal space-y-1.5 pl-4 text-xs leading-relaxed">
                {recipe.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <div className="border-line mt-3 border-t pt-3">
                <RecipeToggle
                  recipeKey={recipe.id}
                  provider={recipe.provider}
                  applied={appliedKeys.get(recipe.id) ?? false}
                />
              </div>
            </Card>
          </li>
        ))}
      </ul>

      <h2 className="display mt-8 mb-1 text-xl">{broker.headline}</h2>
      <Card>
        <p className="text-ink-soft text-sm leading-relaxed">{broker.body}</p>
        <div className="mt-3">
          <Notice tone="warm" title="What this version actually does">
            {broker.caveat}
          </Notice>
        </div>
      </Card>
    </>
  )
}

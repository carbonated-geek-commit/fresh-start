import Link from 'next/link'
import type { PlannedNudge } from '@/nudges'

/**
 * SPEC 05 section 5.3 — the two daily nudges, surfaced in-app.
 *
 * The scheduler produces a plan; something has to show it. Push delivery is
 * the deferred half (ADR-002), so the in-app strip is what makes the cue real
 * for a user who has the app open — and it is what a push notification would
 * deep-link to once a transport exists.
 *
 * A nudge whose time has not arrived is shown as *upcoming* rather than
 * hidden, because knowing the cue is coming is itself part of the scaffolding.
 */
/**
 * Which nudge the strip will show, or null. Exported so the caller can avoid
 * repeating the same message further down the page — the recovery prompt
 * appearing twice on one screen reads as a glitch, not as emphasis.
 */
export function leadNudge(
  nudges: readonly PlannedNudge[],
  now: Date,
): PlannedNudge | null {
  const due = nudges
    .filter((n) => n.fireAt.getTime() <= now.getTime())
    .sort((a, b) => b.fireAt.getTime() - a.fireAt.getTime())
  const upcoming = nudges
    .filter((n) => n.fireAt.getTime() > now.getTime())
    .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime())
  return due[0] ?? upcoming[0] ?? null
}

export function CueStrip({
  nudges,
  now,
  timeZone,
}: {
  nudges: readonly PlannedNudge[]
  now: Date
  timeZone: string
}) {
  if (nudges.length === 0) return null

  // The most useful single cue: the one that is due, or failing that the next
  // one coming. Showing all of them turns scaffolding into a to-do list, which
  // is the thing this product is trying not to be.
  const nudge = leadNudge(nudges, now)
  if (!nudge) return null

  const isDue = nudge.fireAt.getTime() <= now.getTime()
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(nudge.fireAt)

  return (
    <aside
      className={`mb-4 rounded-xl border p-4 ${
        nudge.kind === 'recovery'
          ? 'border-accent/30 bg-accent-soft'
          : 'border-line bg-paper-raised'
      }`}
    >
      <p className="text-ink-faint text-[0.65rem] font-medium tracking-widest uppercase">
        {nudge.kind === 'recovery'
          ? 'Today'
          : nudge.kind === 'morning_cue'
            ? isDue
              ? 'Your cue'
              : `Your cue · ${time}`
            : isDue
              ? 'Evening check'
              : `Evening check · ${time}`}
      </p>
      <p className="mt-1 text-sm font-semibold">{nudge.title}</p>
      <p className="text-ink-soft mt-1 text-xs leading-relaxed">{nudge.body}</p>
      <Link
        href={`/habit/${nudge.commitmentId}`}
        className="text-ink mt-2 inline-block text-xs underline underline-offset-4"
      >
        Open {nudge.habitLabel}
      </Link>
    </aside>
  )
}

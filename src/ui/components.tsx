import Link from 'next/link'
import type { ReactNode } from 'react'
import type { DaySlot } from '@/engine/streak'
import type { LoadIndicator, LoadLevel } from '@/habits/load'
import { formatMinor } from '@/engine/ramp'

export function PageTitle({ children, kicker }: { children: ReactNode; kicker?: string }) {
  return (
    <header className="mb-5">
      {kicker ? (
        <p className="text-ink-faint text-xs font-medium tracking-widest uppercase">{kicker}</p>
      ) : null}
      <h1 className="display mt-1 text-3xl leading-tight">{children}</h1>
    </header>
  )
}

export function Card({
  children,
  className = '',
  as: Tag = 'section',
}: {
  children: ReactNode
  className?: string
  as?: 'section' | 'article' | 'div'
}) {
  return <Tag className={`card p-4 ${className}`}>{children}</Tag>
}

export function Button({
  children,
  variant = 'primary',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'quiet' | 'ghost' }) {
  const styles = {
    primary: 'bg-accent text-white hover:opacity-90',
    quiet: 'bg-accent-soft text-ink hover:opacity-80',
    ghost: 'text-ink-soft hover:text-ink underline underline-offset-4',
  }[variant]
  return (
    <button
      {...props}
      className={`tap inline-flex items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium disabled:opacity-40 ${styles} ${props.className ?? ''}`}
    >
      {children}
    </button>
  )
}

export function LinkButton({
  href,
  children,
  variant = 'primary',
}: {
  href: string
  children: ReactNode
  variant?: 'primary' | 'quiet'
}) {
  const styles =
    variant === 'primary' ? 'bg-accent text-white' : 'bg-accent-soft text-ink'
  return (
    <Link
      href={href}
      className={`tap inline-flex items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium ${styles}`}
    >
      {children}
    </Link>
  )
}

export function Notice({
  tone = 'neutral',
  title,
  children,
}: {
  tone?: 'neutral' | 'warm' | 'hold'
  title?: string
  children: ReactNode
}) {
  const styles = {
    neutral: 'border-line bg-paper-raised',
    warm: 'border-accent/30 bg-accent-soft',
    hold: 'border-hold/30 bg-hold-soft',
  }[tone]
  return (
    <div className={`rounded-xl border p-4 text-sm leading-relaxed ${styles}`}>
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      <div className="text-ink-soft">{children}</div>
    </div>
  )
}

/**
 * The habit-load indicator (SPEC 03 section 3.4).
 *
 * It warns; it never blocks. There is no disabled state driven from this
 * component — the only ceiling is five, and that is enforced server-side.
 */
export function LoadMeter({ load }: { load: LoadIndicator }) {
  const colors: Record<LoadLevel, string> = {
    green: 'bg-load-green',
    yellow: 'bg-load-yellow',
    orange: 'bg-load-orange',
    red: 'bg-load-red',
  }
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold">{load.headline}</p>
        <p className="text-ink-faint text-xs">
          {load.habitCount} of 5
          {load.dataBacked ? ' · from your data' : ''}
        </p>
      </div>
      <div className="flex gap-1" role="img" aria-label={`${load.habitCount} of 5 habits`}>
        {[1, 2, 3, 4, 5].map((slot) => (
          <span
            key={slot}
            className={`h-1.5 flex-1 rounded-full ${
              slot <= load.habitCount ? colors[load.level] : 'bg-line'
            }`}
          />
        ))}
      </div>
      <p className="text-ink-soft mt-2 text-xs leading-relaxed">{load.note}</p>
    </div>
  )
}

/**
 * The window calendar.
 *
 * A missed day is `rest` coloured — muted, not red. SPEC 05 section 5.5 says
 * not to imply a missed day destroys progress, and colour is the loudest thing
 * on this screen.
 */
export function WindowStrip({ slots }: { slots: readonly DaySlot[] }) {
  const styles: Record<DaySlot['status'], string> = {
    completed: 'bg-hold text-white',
    grace: 'bg-grace text-white',
    missed: 'bg-rest text-ink-soft',
    pending: 'border-2 border-dashed border-accent text-accent',
    future: 'border border-line text-ink-faint',
  }
  const labels: Record<DaySlot['status'], string> = {
    completed: 'done',
    grace: 'grace day',
    missed: 'not logged',
    pending: 'today, not yet logged',
    future: 'still to come',
  }

  return (
    <ol className="grid grid-cols-10 gap-1">
      {slots.map((slot, index) => (
        <li key={slot.day}>
          <span
            title={`${slot.day} — ${labels[slot.status]}`}
            className={`flex aspect-square items-center justify-center rounded-md text-[0.6rem] font-medium ${styles[slot.status]}`}
          >
            <span className="sr-only">{`Day ${index + 1}, ${slot.day}: ${labels[slot.status]}`}</span>
            <span aria-hidden>{index + 1}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

export function ValueBar({
  accruedMinor,
  targetMinor,
  percent,
}: {
  accruedMinor: number
  targetMinor: number
  percent: number
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <p className="display text-2xl">{formatMinor(accruedMinor)}</p>
        <p className="text-ink-faint text-xs">of {formatMinor(targetMinor)}</p>
      </div>
      <div
        className="bg-line h-2 overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progress toward target"
      >
        <span
          className="bg-hold block h-full rounded-full"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
    </div>
  )
}

export function FieldLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <span className="block">
      <span className="text-sm font-medium">{children}</span>
      {hint ? <span className="text-ink-faint mt-0.5 block text-xs leading-relaxed">{hint}</span> : null}
    </span>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-load-red mt-2 text-sm leading-relaxed">
      {children}
    </p>
  )
}

/**
 * Confirmation after a server action.
 *
 * `aria-live="polite"` because these messages appear without a navigation —
 * "Logged. +500 pts." and the recovery acknowledgement both land this way, and
 * a screen-reader user who does not hear them has no idea the log worked.
 *
 * **The element renders even when empty, on purpose.** A live region that is
 * mounted at the same moment its content arrives is frequently not announced;
 * the region has to already exist for the change to be observed. So callers
 * pass a possibly-null child rather than conditionally rendering this.
 */
export function StatusText({ children }: { children: ReactNode }) {
  return (
    <p
      aria-live="polite"
      className={`text-ink-soft text-xs leading-relaxed ${children ? 'mt-2' : ''}`}
    >
      {children}
    </p>
  )
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <Card className="text-center">
      <p className="display text-xl">{title}</p>
      <p className="text-ink-soft mx-auto mt-2 max-w-sm text-sm leading-relaxed">{body}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </Card>
  )
}

'use client'

import { useActionState } from 'react'
import { invitePartnerAction, removePartnerAction, type ActionState } from '../../actions'
import { PARTNER_ROLES } from '@/partners'
import { Button, Card, ErrorText, FieldLabel, StatusText } from '@/ui/components'

export interface PartnerRow {
  email: string
  role: 'witness' | 'referee'
  status: 'pending' | 'linked'
}

/**
 * SPEC 04 sections 4.1–4.3.
 *
 * The copy here has one job beyond collecting an address: telling the user
 * exactly what will be sent to it. N6 limits sends to the completion
 * notifications the inviter authorised, and an inviter who does not know what
 * they authorised has not really authorised it.
 */
export function PartnerPanel({
  commitmentId,
  partners,
}: {
  commitmentId: string
  partners: PartnerRow[]
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(invitePartnerAction, {})
  const [removeState, removeAction] = useActionState<ActionState, FormData>(removePartnerAction, {})

  return (
    <Card>
      <h2 className="text-sm font-medium">Someone watching</h2>
      <p className="text-ink-faint mt-1 text-xs leading-relaxed">
        Optional. They get a short note when you complete a day — your name, the habit, and that
        you did it. Not your total, not your streak, not anything else.
      </p>

      {partners.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {partners.map((partner) => (
            <li
              key={partner.email}
              className="border-line flex items-center justify-between gap-3 rounded-xl border p-3"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm">{partner.email}</span>
                <span className="text-ink-faint text-xs">
                  {partner.role === 'witness' ? 'Witness' : 'Referee'}
                  {partner.status === 'pending' ? ' · not yet opted in' : ''}
                </span>
              </span>
              <form action={removeAction}>
                <input type="hidden" name="commitmentId" value={commitmentId} />
                <input type="hidden" name="email" value={partner.email} />
                <Button type="submit" variant="ghost">
                  Remove
                </Button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}

      {removeState.error ? <ErrorText>{removeState.error}</ErrorText> : null}

      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="commitmentId" value={commitmentId} />

        <label className="block space-y-2">
          <FieldLabel hint="We store this address on your profile so we can send those notes. We do not create an account for them, and there is no marketing path it could end up on.">
            Their email
          </FieldLabel>
          <input
            type="email"
            name="email"
            required
            className="border-line bg-paper tap w-full rounded-xl border px-3 text-base"
            placeholder="sam@example.com"
          />
        </label>

        <fieldset>
          <legend className="text-sm font-medium">What can they do?</legend>
          <div className="mt-2 space-y-2">
            {PARTNER_ROLES.map((role, index) => (
              <label
                key={role.id}
                className="border-line flex cursor-pointer items-start gap-2.5 rounded-xl border p-3"
              >
                <input
                  type="radio"
                  name="role"
                  value={role.id}
                  defaultChecked={index === 0}
                  className="mt-0.5 size-4"
                />
                <span className="text-sm">
                  {role.name}
                  <span className="text-ink-faint block text-xs leading-relaxed">
                    {role.capability}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <Button type="submit" variant="quiet" disabled={pending}>
          {pending ? 'Inviting…' : 'Invite them'}
        </Button>
        {state.error ? <ErrorText>{state.error}</ErrorText> : null}
        <StatusText>{state.message}</StatusText>
      </form>
    </Card>
  )
}

import { PageTitle, Card } from '@/ui/components'

export const metadata = { title: 'Offline — FreshStart' }

/**
 * Served by the service worker when a navigation fails.
 *
 * It cannot show the user's habits, because their pages are never cached —
 * every one of them carries personal data, and the browser's Cache Storage is
 * outside the consent ledger's governance (SPEC 06). Saying so plainly is
 * better than an empty shell that looks broken.
 */
export default function OfflinePage() {
  return (
    <>
      <PageTitle kicker="No connection">You are offline.</PageTitle>
      <Card>
        <p className="text-ink-soft text-sm leading-relaxed">
          Your habits are not stored on this device, so there is nothing to show you until you are
          back online. That is deliberate — keeping a copy here would put your data somewhere this
          app cannot govern.
        </p>
        <p className="text-ink-soft mt-3 text-sm leading-relaxed">
          Nothing is lost. If you did the thing today, log it when you reconnect — and if that is
          tomorrow, logging yesterday is accepted at full value.
        </p>
      </Card>
    </>
  )
}

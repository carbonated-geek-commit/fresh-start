'use client'

import { useEffect, useState } from 'react'
import { savePushSubscription, removePushSubscription } from '../actions'
import { Button, Card, ErrorText, StatusText } from '@/ui/components'

type State = 'checking' | 'unsupported' | 'blocked' | 'off' | 'on' | 'working'

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalised)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

/**
 * Q15 — the subscribe control.
 *
 * Rendered only when the server has VAPID keys. Without them the app is in-app
 * only and this does not appear, so there is no button that promises something
 * the deployment cannot deliver.
 */
export function PushToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>('checking')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setState('blocked')
      return
    }
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setState(subscription ? 'on' : 'off'))
      .catch(() => setState('off'))
  }, [])

  async function enable() {
    setError(null)
    setState('working')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off')
        return
      }
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      })
      const json = subscription.toJSON()
      await savePushSubscription({
        endpoint: subscription.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
      })
      setState('on')
    } catch {
      setError('Could not turn those on. Your browser may have blocked them.')
      setState('off')
    }
  }

  async function disable() {
    setError(null)
    setState('working')
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await removePushSubscription(subscription.endpoint)
        await subscription.unsubscribe()
      }
      setState('off')
    } catch {
      setError('Could not turn those off. Try again.')
      setState('on')
    }
  }

  return (
    <Card>
      <p className="text-sm font-medium">Cues on this device</p>
      <p className="text-ink-soft mt-1 text-xs leading-relaxed">
        The two prompts, delivered even when the app is closed. The notification is built on your
        device — what we send carries nothing in it, so your habit never travels through the push
        service.
      </p>

      <div className="mt-3">
        {state === 'checking' ? (
          <StatusText>Checking…</StatusText>
        ) : state === 'unsupported' ? (
          <StatusText>This browser cannot do push notifications. The in-app cue still works.</StatusText>
        ) : state === 'blocked' ? (
          <StatusText>
            Notifications are blocked for this site in your browser settings. The in-app cue still
            works.
          </StatusText>
        ) : state === 'on' ? (
          <div className="flex items-center gap-3">
            <span className="bg-hold-soft text-ink rounded-full px-2.5 py-1 text-xs font-semibold">
              on
            </span>
            <Button type="button" variant="ghost" onClick={disable}>
              Turn off on this device
            </Button>
          </div>
        ) : (
          <Button type="button" variant="quiet" onClick={enable} disabled={state === 'working'}>
            {state === 'working' ? 'One moment…' : 'Turn them on'}
          </Button>
        )}
      </div>

      {error ? <ErrorText>{error}</ErrorText> : null}
    </Card>
  )
}

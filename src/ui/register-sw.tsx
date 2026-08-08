'use client'

import { useEffect } from 'react'

/**
 * Registers the service worker.
 *
 * Production only: in development it would cache build output that changes on
 * every edit and produce confusing stale-asset behaviour.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // On localhost, actively tear down any worker a previous production build
    // left behind. Without this, a worker registered once during a production
    // run keeps intercepting `next dev` — which is exactly how the stale-chunk
    // failure documented in sw.js was found.
    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
        .catch(() => undefined)
      return
    }

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // A failed registration costs the user nothing — the app works without
        // it. Nothing to report and nothing to retry.
      })
    }

    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }, [])

  return null
}

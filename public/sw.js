/*
 * FreshStart service worker.
 *
 * Its entire job is the offline fallback. It does NOT cache application code.
 *
 * An earlier version cache-first'd `/_next/static/**` behind a hand-written
 * VERSION constant, and that was a bug worth remembering: build output is
 * fingerprinted and the chunk names change every deploy, so a stale cache
 * keyed on a constant serves 404s for chunks the new HTML asks for, and the
 * app dies with "Failed to read a RSC payload". It only recovers when someone
 * remembers to bump the constant. Next.js already fingerprints those files and
 * serves them immutable — the browser's own HTTP cache handles them correctly,
 * and the service worker adds nothing but a way to get it wrong.
 *
 * Pages are not cached either. Every page in this app is server-rendered
 * behind a session and carries personal data; Cache Storage sits outside the
 * consent ledger's governance (SPEC 06), and putting behavioural data there is
 * the kind of thing N9 exists to prevent.
 *
 * So: precache one static offline page, serve it when a navigation fails, and
 * stay out of the way otherwise.
 */

const CACHE = 'freshstart-offline'
const OFFLINE_URL = '/offline'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Navigations only. Everything else — application chunks, data requests,
  // server actions — goes straight to the network, untouched.
  if (request.mode !== 'navigate') return

  // Never intercept a non-GET navigation: replaying one would re-submit a
  // habit log or a settlement decision at a moment the user did not choose,
  // and N5 requires settlement to follow a live user action.
  if (request.method !== 'GET') return

  event.respondWith(
    fetch(request).catch(() =>
      caches
        .match(OFFLINE_URL)
        .then((cached) => cached ?? new Response('Offline', { status: 503 })),
    ),
  )
})

/*
 * Q15 — the contentless push tickle.
 *
 * The push carries no payload. This handler fetches the cue from the app with
 * the user's own session cookie, so the notification text is assembled here,
 * on the user's device, from a request that ran inside the app's normal RLS
 * boundary. The push service saw only that a message was delivered.
 *
 * A tickle that resolves to no cue — the evening check on a day already
 * logged, say — shows nothing. That suppression cannot happen upstream,
 * because the dispatcher is not permitted to know what was logged.
 */
self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let cue = null
      try {
        const response = await fetch('/api/cue', {
          credentials: 'include',
          cache: 'no-store',
        })
        if (response.ok) cue = (await response.json()).cue
      } catch {
        // Offline, or the session has gone. Either way there is nothing
        // honest to show, and a generic "open the app" notification would be
        // noise the user did not ask for.
      }

      if (!cue) return

      await self.registration.showNotification(cue.title, {
        body: cue.body,
        tag: cue.tag,
        // Replace rather than stack: two cues for the same habit on the same
        // day is the app nagging, which is the opposite of scaffolding.
        renotify: false,
        icon: '/icon.svg',
        badge: '/icon.svg',
        data: { url: cue.url },
      })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus an open tab if there is one, rather than piling up windows.
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})

// Lets a future release retire this worker without waiting for every tab to
// close — `registration.unregister()` from the page is the escape hatch if the
// offline behaviour ever needs pulling in a hurry.
self.addEventListener('message', (event) => {
  if (event.data === 'unregister') self.registration.unregister()
})

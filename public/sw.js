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

// Lets a future release retire this worker without waiting for every tab to
// close — `registration.unregister()` from the page is the escape hatch if the
// offline behaviour ever needs pulling in a hurry.
self.addEventListener('message', (event) => {
  if (event.data === 'unregister') self.registration.unregister()
})

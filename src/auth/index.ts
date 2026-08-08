/**
 * T02 — auth and session.
 *
 * Supabase Auth is the approved integration (CLAUDE.md section 4). When it is
 * configured, the session comes from it and the access token is handed to the
 * Supabase store so RLS sees a real `auth.uid()`.
 *
 * With no Supabase credentials the app runs in **local mode**: a single
 * identity held in a cookie, backed by the in-memory store. That is a
 * development and demo mode, and it says so on every screen — it is not an
 * auth implementation and must not be reachable in a deployment that has
 * Supabase configured (see `isLocalMode`).
 */

import { cookies } from 'next/headers'

export const LOCAL_SESSION_COOKIE = 'freshstart_local_session'

export interface Session {
  readonly userId: string
  readonly displayName: string
  /** Present only when Supabase Auth issued it. Passed to the store for RLS. */
  readonly accessToken?: string
  /** True when running on the cookie identity rather than Supabase Auth. */
  readonly isLocal: boolean
}

/** True when no Supabase credentials are configured. */
export function isLocalMode(): boolean {
  return !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
}

/**
 * The stable local identity.
 *
 * A fixed UUID rather than a random one so a restart of the dev server does
 * not orphan the data that survived it.
 */
const LOCAL_USER_ID = '00000000-0000-4000-8000-000000000001'

export async function getSession(): Promise<Session | null> {
  if (isLocalMode()) {
    const store = await cookies()
    const cookie = store.get(LOCAL_SESSION_COOKIE)
    if (!cookie) return null
    return { userId: LOCAL_USER_ID, displayName: cookie.value, isLocal: true }
  }

  const { createServerClient } = await import('@supabase/ssr')
  const cookieStore = await cookies()

  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        // Read-only in a Server Component; the route handler does the writing.
        setAll: () => undefined,
      },
    },
  )

  const {
    data: { user },
  } = await client.auth.getUser()
  if (!user) return null

  const {
    data: { session },
  } = await client.auth.getSession()

  return {
    userId: user.id,
    displayName: (user.user_metadata?.display_name as string | undefined) ?? user.email ?? 'You',
    accessToken: session?.access_token,
    isLocal: false,
  }
}

export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) throw new AuthRequiredError()
  return session
}

export class AuthRequiredError extends Error {
  constructor() {
    super('Sign in first.')
    this.name = 'AuthRequiredError'
  }
}

/** Start a local session. Only reachable when `isLocalMode()`. */
export async function startLocalSession(displayName: string): Promise<void> {
  if (!isLocalMode()) throw new Error('Local sessions are disabled when Supabase is configured.')
  const store = await cookies()
  store.set(LOCAL_SESSION_COOKIE, displayName.trim().slice(0, 80) || 'You', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}

export async function endLocalSession(): Promise<void> {
  const store = await cookies()
  store.delete(LOCAL_SESSION_COOKIE)
}

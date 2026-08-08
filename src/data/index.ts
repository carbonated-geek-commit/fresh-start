import { MemoryStore } from './memory-store'
import { SupabaseStore } from './supabase-store'
import type { Store } from './types'

export * from './types'
export { MemoryStore, SupabaseStore }

/**
 * Resolve the store.
 *
 * Supabase when both URL and anon key are present; the in-memory store
 * otherwise. Falling back rather than failing is deliberate: a developer who
 * has cloned the repo and run `npm run dev` should get a working app on the
 * first try, and the credential absence is a documented mode rather than a
 * misconfiguration.
 */
export function resolveStore(accessToken?: string): Store {
  return SupabaseStore.fromEnv(accessToken) ?? new MemoryStore()
}

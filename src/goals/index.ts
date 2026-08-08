/**
 * SPEC 03 — Goal Translator and Habit Sizing. Public surface.
 *
 * Provider selection lives here so every caller resolves it the same way, and
 * so the default is the one that needs no credential.
 */

import { heuristicProvider } from './providers/heuristic'
import type { TranslatorProvider } from './translator'

export * from './schema'
export * from './classifier'
export * from './stake-guard'
export * from './translator'
export { heuristicProvider }

/**
 * The configured provider.
 *
 * Defaults to the deterministic classifier. The LLM provider is selected only
 * when both `FRESHSTART_TRANSLATOR=anthropic` and `ANTHROPIC_API_KEY` are set —
 * a missing credential silently falls back rather than failing a user's goal
 * entry, because a working decomposition beats an error page.
 */
export async function resolveTranslatorProvider(): Promise<TranslatorProvider> {
  if (process.env.FRESHSTART_TRANSLATOR !== 'anthropic') return heuristicProvider
  if (!process.env.ANTHROPIC_API_KEY) return heuristicProvider

  const { createAnthropicProvider } = await import('./providers/anthropic')
  return createAnthropicProvider()
}

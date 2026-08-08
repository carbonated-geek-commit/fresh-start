/**
 * The LLM translator provider.
 *
 * CLAUDE.md section 4 approves exactly one LLM integration: "LLM API — goal
 * translator only. Never receives email content."
 *
 * This module is the whole of that integration, and it is deliberately narrow:
 *
 *   - Its only input is `goalText`, a string the user typed into the goal box.
 *     There is no parameter through which email content (N8), health records
 *     (N10), or partner data could reach it.
 *   - Its only output is a candidate decomposition. It does not decide what may
 *     be staked — `reconcileSizeClass` and `assertStakeable` do, on the way
 *     back. A model that hallucinated `small` for an outcome still cannot
 *     produce a staked outcome.
 *   - It is off unless `ANTHROPIC_API_KEY` is set. Absence of the credential is
 *     the enforcement, exactly as for the mocked integrations.
 *
 * The SDK is imported dynamically so a deployment that never enables this
 * provider does not load it at all.
 */

import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'
import { SIZE_CLASSES } from '../schema'
import type { TranslatorProvider } from '../translator'

/**
 * SPEC 03 section 3.3, as a JSON Schema for structured outputs.
 *
 * Written out rather than derived from the zod schema: the SDK's zod helper
 * targets zod v4 and this project is on v3, and a hand-written schema keeps
 * the wire contract legible next to the spec section it implements. The zod
 * schema still validates whatever comes back — see `runTranslator`.
 *
 * Structured outputs reject length and range constraints, so the bounds in the
 * zod schema (label ≤ 120 chars, ≤ 12 behaviours) are enforced on parse rather
 * than by the model.
 */
const TRANSLATION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    motivating_outcome: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'The result the person is really after, or null. Never staked, never scored.',
    },
    behaviors: {
      type: 'array',
      description: 'Every action the goal decomposes into, including any that are outcomes.',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'A few words, as the person would say it.' },
          size_class: { type: 'string', enum: [...SIZE_CLASSES] },
          est_minutes: {
            anyOf: [{ type: 'integer' }, { type: 'null' }],
            description: 'Minutes one instance takes, or null when the goal does not imply one.',
          },
          rationale: { type: 'string', description: 'One plain sentence addressed to the person.' },
        },
        required: ['label', 'size_class', 'est_minutes', 'rationale'],
        additionalProperties: false,
      },
    },
    recommended_start: {
      type: 'array',
      description: 'Labels of the smallest viable rungs. Never includes an x_large item.',
      items: { type: 'string' },
    },
  },
  required: ['motivating_outcome', 'behaviors', 'recommended_start'],
  additionalProperties: false,
} as const

/** SPEC 03 section 3.3: the translator proposes; the user chooses. */
const SYSTEM_PROMPT = `You decompose a stated life goal into the concrete behaviours that would achieve it.

A behaviour is an action the person performs and controls. An outcome is a result that depends on
things they do not control — physiology, other people, time, chance. Classify anything that is a
result rather than an action as size_class "x_large", however it is phrased.

Size the behaviours by how long one instance takes: small is 0-15 minutes, medium is 15-30, large is
over 30. Set est_minutes when the goal states or clearly implies a duration, and null otherwise.

recommended_start lists the smallest viable rungs to begin with — usually one or two small
behaviours. Never include an x_large item in it. The larger rungs are added later, once the small
ones hold.

Write each label as the person would say it, in a few words. Write each rationale as one plain
sentence addressed to them.`

function userPrompt(goalText: string): string {
  return `Decompose this goal:\n\n${goalText}`
}

export interface AnthropicProviderOptions {
  /** Defaults to `process.env.ANTHROPIC_API_KEY`. */
  readonly apiKey?: string
  readonly model?: string
}

export function createAnthropicProvider(options: AnthropicProviderOptions = {}): TranslatorProvider {
  const model = options.model ?? 'claude-opus-5'

  return {
    id: 'anthropic',

    async translate(goalText: string): Promise<unknown> {
      const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY
      if (!apiKey) {
        throw new Error(
          'anthropic translator: ANTHROPIC_API_KEY is not set. Unset FRESHSTART_TRANSLATOR to ' +
            'use the deterministic translator instead.',
        )
      }

      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      const client = new Anthropic({ apiKey })

      const response = await client.messages.parse({
        model,
        max_tokens: 4_000,
        // A scoped extraction task. Thinking stays on (the default on this
        // model) with low effort rather than being disabled.
        output_config: {
          effort: 'low',
          format: jsonSchemaOutputFormat(TRANSLATION_JSON_SCHEMA),
        },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt(goalText) }],
      })

      if (response.stop_reason === 'refusal') {
        throw new Error('anthropic translator: the request was declined.')
      }
      if (response.stop_reason === 'max_tokens') {
        throw new Error('anthropic translator: response was truncated before it was complete.')
      }
      if (response.parsed_output == null) {
        throw new Error('anthropic translator: no structured output was returned.')
      }

      // Returned unvalidated on purpose. `runTranslator` applies the schema and
      // the cross-field checks, so this provider gets no special trust.
      return response.parsed_output
    },
  }
}

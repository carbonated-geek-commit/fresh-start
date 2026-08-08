/*
 * Run the data-spine suite against a real PostgreSQL, with no Docker.
 *
 * `scripts/db-test.sh` is the Docker path and remains the one to use in CI.
 * This is the fallback for a machine where the Docker daemon will not start —
 * `embedded-postgres` downloads and runs a genuine PostgreSQL binary, so the
 * RLS policies are exercised by the real planner rather than a simulation.
 * A simulated RLS test would be worse than no test: it would report green on
 * enforcement that does not exist.
 *
 *   node scripts/db-test.mjs
 *
 * Applies db/migrations/** then db/policies/**, runs db/tests/rls.test.sql,
 * and exits non-zero on the first failure.
 */

import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import EmbeddedPostgres from 'embedded-postgres'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.FRESHSTART_TEST_PG_PORT ?? 55433)

const MIGRATIONS = [
  'db/migrations/0000_auth_shim.sql',
  'db/migrations/consent/0001_consent_ledger.sql',
  'db/migrations/consent/0002_profiles.sql',
  'db/migrations/stakes/0001_stake_ledger.sql',
  'db/migrations/consent/0003_push_subscriptions.sql',
  'db/policies/0001_rls.sql',
  'db/policies/0002_nudger.sql',
]

const dataDir = mkdtempSync(join(tmpdir(), 'freshstart-pg-'))
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'freshstart-test',
  port: PORT,
  persistent: false,
})

let failed = false

try {
  console.log('==> initialising postgres')
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('freshstart')

  const client = pg.getPgClient('freshstart')
  await client.connect()

  console.log('==> applying migrations')
  for (const file of MIGRATIONS) {
    process.stdout.write(`    ${file}\n`)
    await client.query(readFileSync(join(ROOT, file), 'utf8'))
  }

  console.log('==> running db/tests/rls.test.sql')

  // psql metacommands are not valid over the wire protocol; the suite only
  // uses \set ON_ERROR_STOP, which is redundant here because a failed query
  // rejects the promise.
  const suite = readFileSync(join(ROOT, 'db/tests/rls.test.sql'), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('\\'))
    .join('\n')

  const notices = []
  client.on('notice', (notice) => {
    const text = String(notice.message ?? '').trim()
    if (text) notices.push(text)
  })

  await client.query(suite)

  for (const notice of notices) console.log(`    ${notice}`)

  const passed = notices.filter((n) => n.startsWith('ok')).length
  const failures = notices.filter((n) => n.startsWith('FAIL'))

  console.log(`\n==> ${passed} assertions passed`)
  if (failures.length > 0) {
    failed = true
    for (const failure of failures) console.error(`    ${failure}`)
  }

  await client.end()
} catch (error) {
  failed = true
  console.error('\n==> FAILED\n')
  console.error(error instanceof Error ? error.message : error)
} finally {
  try {
    await pg.stop()
  } catch {
    // Best effort — the data directory is a temp dir either way.
  }
  rmSync(dataDir, { recursive: true, force: true })
}

process.exit(failed ? 1 : 0)

// Not a test of the suite: nothing in its name makes bun or Playwright pick it up.
// tests/integration/preprod-demarrage.test.ts runs it in a child process, under the environment of
// the bench: one start of Payload as the pre-production starts it (ticket 027). In production
// mode, so that Payload plays its migrations when it connects, and ends this process when one of
// them fails, as it ends the server; with the reset of a token before them
// (src/preprod/au-demarrage.ts); then, when asked, the start import (src/preprod/tranche.ts).
//
// The test gives what to start with in TEMOIN_PREPROD (JSON, `Demande` below) and reads what this
// process prints: the lines of the start log, `[preprod] …`, then one line `ISSUE {…}`.
//
// A process of its own: a second Payload in the process of the tests would share the sanitized
// configuration of the Payload of the bench, and Payload does not expect that.

import path from 'node:path'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { BasePayload, type Payload, type SanitizedConfig } from 'payload'
import { migrations } from '../../src/migrations'
import { avecLaRemiseAZero } from '../../src/preprod/au-demarrage'
import { demarrerLaPreprod, PreprodRefusee } from '../../src/preprod/tranche'
import { exigerBanc } from '../outils/payload-test'

interface Demande {
	/** The token of PREPROD_REMISE_A_ZERO, or nothing. */
	jeton?: string
	/** The database the start accepts as the one of the pre-production. Nothing: the real one. */
	base?: string
	/** Where the fake source is posed: a name of the bench. */
	source: { base: string; role: string }
	/** The migrations of the code, or the fictional `init` below. */
	migrations: 'code' | 'init'
	/** Whether the start import runs once Payload has started, as its `onInit` does. */
	importer: boolean
}

/**
 * A migration an old database cannot take, as `init` (ticket 049) was for the databases of the
 * provisional migrations: one migration of a name it never played, which creates every table and
 * type the migrations of the code already created there.
 */
const INIT_FICTIVE: typeof migrations = [
	{
		name: '20991231_000000_init_fictive',
		up: async arguments_ => {
			for (const migration of migrations) await migration.up(arguments_)
		},
		down: async () => undefined,
	},
]

const databaseUri = exigerBanc()
const demande = JSON.parse(process.env.TEMOIN_PREPROD ?? '{}') as Demande
const journal = (ligne: string): void => console.log(`[preprod] ${ligne}`)

// The configuration is loaded under the environment of the bench: it checks it.
const { default: configuration } = (await import('@payload-config')) as { default: Promise<SanitizedConfig> }
const db = avecLaRemiseAZero(
	postgresAdapter({
		disableCreateDatabase: true,
		migrationDir: path.resolve(import.meta.dir, '../../src/migrations'),
		// As many connections as the application has (src/payload.config.ts).
		pool: { connectionString: databaseUri, max: 5 },
		prodMigrations: demande.migrations === 'init' ? INIT_FICTIVE : migrations,
		push: false,
	}),
	{ databaseUri, preprod: demande.jeton === undefined ? {} : { remiseAZero: demande.jeton } },
	{
		...(demande.base !== undefined && { base: demande.base }),
		source: demande.source,
		journal,
		migrationEnCours: false,
	}
)

// Payload plays its migrations when it connects in production only.
Reflect.set(process.env, 'NODE_ENV', 'production')
const payload = new BasePayload() as Payload
// The adapter as `buildConfig` would sanitize it: postgresAdapter already sets every field.
await payload.init({ config: { ...(await configuration), db: db as SanitizedConfig['db'] }, disableOnInit: true })

if (demande.importer) {
	try {
		const issue = await demarrerLaPreprod(payload, {
			preprod: {},
			databaseUri,
			journal,
			source: demande.source,
			...(demande.base !== undefined && { base: demande.base }),
		})
		console.log(
			`ISSUE ${JSON.stringify(
				issue.etat === 'importee'
					? { etat: issue.etat, code: issue.code, profils: issue.rapport.collections.profils }
					: issue
			)}`
		)
	} catch (erreur) {
		if (!(erreur instanceof PreprodRefusee)) throw erreur
		console.log(`ISSUE ${JSON.stringify({ refus: erreur.message })}`)
	}
}

// Not `pool.end()`: the adapter keeps one client of its pool checked out for good, and `end` would wait for it.
process.exit(0)

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { buildConfig } from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { Admins } from './collections/Admins'
import { Profils } from './collections/Profils'
import { Pros } from './collections/Pros'
import { serverEnv } from './lib/env'
import { migrations } from './migrations'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// Checked here as well as in src/instrumentation.ts: the Payload CLI and the scripts load this
// file without starting the server. Throws when a variable is missing or not valid.
const env = serverEnv()

export default buildConfig({
	admin: {
		user: Admins.slug,
		importMap: { baseDir: dirname },
		// 'off' closes /api/og: an image rendered on demand, for anyone, with or without a session.
		meta: { defaultOGImageType: 'off' },
	},
	collections: [Admins, Pros, Profils],
	// The site and the API share one origin: no other site may read this API from a browser.
	cors: [],
	// A session cookie is accepted from these origins only (src/lib/env.ts).
	csrf: env.trustedOrigins,
	db: postgresAdapter({
		// Outside this machine, a database that does not exist is an error: Payload must not create an empty one.
		disableCreateDatabase: !env.localDatabase,
		migrationDir: path.resolve(dirname, 'migrations'),
		// 5 connections per process, not the 10 of `pg`: a build and a server run several processes at once.
		pool: { connectionString: env.databaseUri, max: 5 },
		// Everywhere else, the schema changes by these migrations: Payload plays them when it starts in production.
		prodMigrations: migrations,
		// The schema is pushed into a database of this machine only. Payload never pushes in production.
		push: env.localDatabase,
	}),
	// Every mail leaves through the relay the environment names (src/lib/env.ts): on the test bench,
	// the mail catcher. Without SMTP_HOST there is no adapter, and Payload writes a log line instead.
	email: env.mail
		? nodemailerAdapter({
				defaultFromAddress: env.mail.fromAddress,
				defaultFromName: env.mail.fromName,
				// Nothing connects while this file is loaded: the Payload CLI, the scripts and the tests
				// load it too. An unreachable relay is an error of the mail that is sent, not of the start.
				skipVerify: true,
				transportOptions: { host: env.mail.host, port: env.mail.port },
			})
		: undefined,
	// REST and the Local API are the only ways in. The two GraphQL routes answer 404 by themselves.
	graphQL: { disable: true },
	secret: env.payloadSecret,
	telemetry: false,
	typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})

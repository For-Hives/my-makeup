import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { s3Storage } from '@payloadcms/storage-s3'
import { buildConfig, type CollectionConfig } from 'payload'
import sharp from 'sharp'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { Admins } from './collections/Admins'
import { Articles } from './collections/Articles'
import { AuthEvents } from './collections/AuthEvents'
import { ContactRequests } from './collections/ContactRequests'
import { DeletedAccounts } from './collections/DeletedAccounts'
import { closedStorageFields, MEDIA_UPLOAD, Media, noUploadWithoutStorage, toPublicUrl } from './collections/Media'
import { Profiles } from './collections/Profiles'
import { Pros } from './collections/Pros'
import { Talents } from './collections/Talents'
import { withTrash } from './collections/trash'
import { boundedQueries } from './lib/bounded-query'
import { adapterWithoutRelay, transportOptions } from './lib/emails/relay'
import { mediaBaseUrl, serverEnv } from './lib/env'
import { mediaUrl, UPLOAD_PREFIX } from './lib/media'
import { PAYLOAD_LANGUAGE } from './lib/payload-language'
import { reserveLocksToAdmins } from './lib/payload-locks'
import { poolSettings, withPoolListener } from './lib/pool-base'
import { createObjectStorage } from './lib/storage'
import { runOnDemandImport } from './migration/on-demand-import'
import { migrations } from './migrations'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// Checked here as well as in src/instrumentation.ts: the Payload CLI and the scripts load this
// file without starting the server. Throws when a variable is missing or not valid.
const env = serverEnv()

// Where the photos are served from: the public origin of the bucket, or the simulator of the test bench.
const mediaBase = mediaBaseUrl(process.env.R2_PUBLIC_URL, env.storage)

// Payload's own route for the file of a media sends to its public address: no photo is on this disk.
const servedMedia: CollectionConfig<'media'> = {
	...Media,
	upload: { ...MEDIA_UPLOAD, handlers: [toPublicUrl(mediaBase)] },
}

// Without an object storage, the media collection keeps its fields but receives no photo.
const media: CollectionConfig<'media'> = env.storage
	? servedMedia
	: {
			...servedMedia,
			hooks: { ...Media.hooks, beforeOperation: [...(Media.hooks?.beforeOperation ?? []), noUploadWithoutStorage] },
		}

// Payload types the keys as its own error names, and reads them by the `name` of the error that is thrown.
const logLevels = {
	APIError: 'info',
	AuthenticationError: 'info',
	CompteBloque: 'info',
	UnverifiedEmail: 'info',
} as const

export default buildConfig({
	// A wrong password, a braked address or an address not yet confirmed is a normal event, not an
	// application error: the weekly report counts the error-level lines (decisions 2026-10-13).
	// CompteBloque (ticket 089) sets its own `name`, so `APIError` does not cover it (ticket 223). Payload's
	// « Missing ID » refusal is a plain APIError: already `info`, a test holds it.
	loggingLevels: logLevels,
	admin: {
		// Without it the admin panel asks gravatar.com for an image computed from the admin's email: a
		// fingerprint of the address sent to a third party (ticket 223).
		avatar: 'default',
		user: Admins.slug,
		importMap: { baseDir: dirname },
		// 'off' closes /api/og: an image rendered on demand, for anyone, with or without a session.
		meta: { defaultOGImageType: 'off' },
	},
	collections: [Admins, Pros, Profiles, media, Talents, Articles, AuthEvents, ContactRequests, DeletedAccounts],
	// The site and the API share one origin: no other site may read this API from a browser.
	cors: [],
	// A session cookie is accepted from these origins only (src/lib/env.ts).
	csrf: env.trustedOrigins,
	// A connection of the pool that PostgreSQL cuts must not kill the server (ticket 223).
	db: withPoolListener(
		postgresAdapter({
			// Outside this machine, a database that does not exist is an error: Payload must not create an empty one.
			disableCreateDatabase: !env.localDatabase,
			migrationDir: path.resolve(dirname, 'migrations'),
			// The size of the pool and the wait limit for a free connection (src/lib/pool-base.ts, tickets 222 and 268).
			pool: poolSettings(env.databaseUri, env.databasePool),
			// Everywhere else, the schema changes by these migrations: Payload plays them when it starts in production.
			prodMigrations: migrations,
			// The schema is pushed into a database of this machine only. Payload never pushes in production.
			push: env.localDatabase,
		})
	),
	// Every mail leaves through the relay the environment names (src/lib/env.ts): on the test bench,
	// the mail catcher. Without SMTP_HOST, Payload's own mails go to an adapter that logs one line, no address.
	email: env.mail
		? nodemailerAdapter({
				defaultFromAddress: env.mail.fromAddress,
				defaultFromName: env.mail.fromName,
				// Nothing connects while this file is loaded: the Payload CLI, the scripts and the tests
				// load it too. An unreachable relay is an error of the mail that is sent, not of the start.
				skipVerify: true,
				transportOptions: transportOptions(env.mail),
			})
		: adapterWithoutRelay,
	// REST and the Local API are the only ways in. The two GraphQL routes answer 404 by themselves.
	graphQL: { disable: true },
	// Payload speaks French only: its errors, its own messages and the admin panel, whatever
	// language a request asks for (src/lib/payload-language.ts, ticket 221).
	i18n: PAYLOAD_LANGUAGE,
	// Once Payload has started and played its migrations.
	onInit: payload => {
		// Payload's document locks are reserved to the accounts of the admin panel (ticket 094).
		reserveLocksToAdmins(payload)
		// The import of the old site, once per new IMPORT_TOKEN, on the site only; not awaited, so that the
		// first request does not wait for it. Without a token nothing is read (ticket 233).
		runOnDemandImport(payload, env)
	},
	plugins: [
		// The photos go to the object storage the environment names (src/lib/env.ts): R2 on the site,
		// the S3 simulator on the test bench. Each media keeps its own prefix: `media/` for a photo
		// sent in the v3, the folder of the old site for an adopted one. The public address is
		// direct, never through Payload: the base of the photos, then the key (src/lib/media.ts).
		// Without a storage the plugin is off, but its fields stay: the schema never depends on the
		// environment.
		// The plugin never deletes an object: a photo that no longer serves goes to the bin of the
		// storage, `deleted/`, and the profiles clean up the photos they no longer reference
		// (src/collections/trash.ts, ticket 045).
		withTrash(
			s3Storage({
				enabled: env.storage !== undefined,
				alwaysInsertFields: true,
				bucket: env.storage?.bucket ?? '',
				collections: {
					media: {
						prefix: UPLOAD_PREFIX,
						disablePayloadAccessControl: true,
						generateFileURL: ({ filename, prefix }) => mediaUrl(mediaBase, prefix, filename),
					},
				},
				config: env.storage
					? {
							endpoint: env.storage.endpoint,
							// R2 answers to the region `auto`; the simulator of the bench ignores it.
							region: 'auto',
							// The bucket in the path, as R2 and the simulator both read it.
							forcePathStyle: true,
							credentials: { accessKeyId: env.storage.accessKeyId, secretAccessKey: env.storage.secretAccessKey },
						}
					: {},
			}),
			env.storage && createObjectStorage(env.storage)
		),
		closedStorageFields,
		// Last, so that it sees every collection: a request too large, or that filters or sorts on a
		// private field, is refused before the database (src/lib/bounded-query.ts, ticket 048).
		boundedQueries,
	],
	secret: env.payloadSecret,
	// Derived sizes of a photo (ticket 133): without it, Payload makes none.
	sharp,
	telemetry: false,
	typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})

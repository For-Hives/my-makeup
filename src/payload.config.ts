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
import {
	aucunEnvoiSansStockage,
	champsDuStockageFermes,
	Media,
	UPLOAD_DES_MEDIAS,
	versLAdressePublique,
} from './collections/Media'
import { Profiles } from './collections/Profiles'
import { Pros } from './collections/Pros'
import { Talents } from './collections/Talents'
import { avecLaCorbeille } from './collections/trash'
import { adaptateurSansRelais, optionsDeTransport } from './lib/emails/relais'
import { mediaBaseUrl, serverEnv } from './lib/env'
import { LANGUE_DE_PAYLOAD } from './lib/langue-payload'
import { adresseDuMedia, PREFIXE_DES_ENVOIS } from './lib/medias'
import { avecLEcouteDuPool, reglagesDuPool } from './lib/pool-base'
import { requetesBornees } from './lib/requete-bornee'
import { stockageS3 } from './lib/stockage'
import { reserverLesVerrousAuxAdmins } from './lib/verrous-payload'
import { lancerLImportALaDemande } from './migration/import-a-la-demande'
import { migrations } from './migrations'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// Checked here as well as in src/instrumentation.ts: the Payload CLI and the scripts load this
// file without starting the server. Throws when a variable is missing or not valid.
const env = serverEnv()

// Where the photos are served from: the public origin of the bucket, or the simulator of the test bench.
const baseDesMedias = mediaBaseUrl(process.env.R2_PUBLIC_URL, env.storage)

// Payload's own route for the file of a media sends to its public address: no photo is on this disk.
const mediaServie: CollectionConfig<'media'> = {
	...Media,
	upload: { ...UPLOAD_DES_MEDIAS, handlers: [versLAdressePublique(baseDesMedias)] },
}

// Without an object storage, the media collection keeps its fields but receives no photo.
const media: CollectionConfig<'media'> = env.storage
	? mediaServie
	: {
			...mediaServie,
			hooks: { ...Media.hooks, beforeOperation: [...(Media.hooks?.beforeOperation ?? []), aucunEnvoiSansStockage] },
		}

// Payload types the keys as its own error names, and reads them by the `name` of the error that is thrown.
const niveauxDeJournal = {
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
	loggingLevels: niveauxDeJournal,
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
	db: avecLEcouteDuPool(
		postgresAdapter({
			// Outside this machine, a database that does not exist is an error: Payload must not create an empty one.
			disableCreateDatabase: !env.localDatabase,
			migrationDir: path.resolve(dirname, 'migrations'),
			// 5 connections per process and a wait limit for a free one (src/lib/pool-base.ts, ticket 222).
			pool: reglagesDuPool(env.databaseUri),
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
				transportOptions: optionsDeTransport(env.mail),
			})
		: adaptateurSansRelais,
	// REST and the Local API are the only ways in. The two GraphQL routes answer 404 by themselves.
	graphQL: { disable: true },
	// Payload speaks French only: its errors, its own messages and the admin panel, whatever
	// language a request asks for (src/lib/langue-payload.ts, ticket 221).
	i18n: LANGUE_DE_PAYLOAD,
	// Once Payload has started and played its migrations.
	onInit: payload => {
		// Payload's document locks are reserved to the accounts of the admin panel (ticket 094).
		reserverLesVerrousAuxAdmins(payload)
		// The import of the old site, once per new IMPORT_JETON, on the site only; not awaited, so that the
		// first request does not wait for it. Without a token nothing is read (ticket 233).
		lancerLImportALaDemande(payload, env)
	},
	plugins: [
		// The photos go to the object storage the environment names (src/lib/env.ts): R2 on the site,
		// the S3 simulator on the test bench. Each media keeps its own prefix: `media/` for a photo
		// sent in the v3, the folder of the old site for an adopted one. The public address is
		// direct, never through Payload: the base of the photos, then the key (src/lib/medias.ts).
		// Without a storage the plugin is off, but its fields stay: the schema never depends on the
		// environment.
		// The plugin never deletes an object: a photo that no longer serves goes to the bin of the
		// storage, `deleted/`, and the profiles clean up the photos they no longer reference
		// (src/collections/trash.ts, ticket 045).
		avecLaCorbeille(
			s3Storage({
				enabled: env.storage !== undefined,
				alwaysInsertFields: true,
				bucket: env.storage?.bucket ?? '',
				collections: {
					media: {
						prefix: PREFIXE_DES_ENVOIS,
						disablePayloadAccessControl: true,
						generateFileURL: ({ filename, prefix }) => adresseDuMedia(baseDesMedias, prefix, filename),
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
			env.storage && stockageS3(env.storage)
		),
		champsDuStockageFermes,
		// Last, so that it sees every collection: a request too large, or that filters or sorts on a
		// private field, is refused before the database (src/lib/requete-bornee.ts, ticket 048).
		requetesBornees,
	],
	secret: env.payloadSecret,
	// Derived sizes of a photo (ticket 133): without it, Payload makes none.
	sharp,
	telemetry: false,
	typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})

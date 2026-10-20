/**
 * Command line that creates an account of the admin panel (README « Créer un compte admin »).
 *
 *   bun run admin:create <email>                   an `admin`, in the database of DATABASE_URI
 *   bun run admin:create <email> --role=editor     an `editor` account
 *   bun run admin:create <email> --remote-target  when DATABASE_URI is not on this machine
 *
 * The first screen of the admin panel does not create the first account any more
 * (`/api/admins/first-register` answers 403, ticket 094): this command does, through the Local
 * API, and it is the only way an account of the panel is born. The password is typed at the
 * keyboard, twice, and never shown, given in an argument or printed. Nothing of the old site's
 * accounts is imported: they are created here, by hand.
 *
 * Exit codes: 0 created; 1 refused, nothing written (the message says why); 2 command line not
 * understood; 3 an unexpected error, named by its type only.
 */

import { isLocalDatabase } from '../../src/lib/env'
import { configurationWithoutSchemaChange } from '../migration/import/target'
import { type Accounts, CreationRefused, createAccount, REMOTE_TARGET_FLAG, readArguments, USAGE } from './account'
import { readSecret } from './keyboard'

async function principal(argv: string[]): Promise<number> {
	const request = readArguments(argv)
	if (!request) {
		console.error(USAGE)
		return 2
	}
	// Before anything is loaded: the configuration of Payload connects to whatever DATABASE_URI names.
	const base = process.env.DATABASE_URI
	if (!base) throw new CreationRefused('DATABASE_URI manque : la commande ne sait pas où écrire. Rien n’est écrit.')
	if (!isLocalDatabase(base) && !request.cibleDistante)
		throw new CreationRefused(
			`DATABASE_URI ne désigne pas une base de ce poste : la commande refuse d’y écrire. Pour une base distante, la commande le dit elle-même : ${REMOTE_TARGET_FLAG}. Rien n’est écrit.`
		)
	// The password is asked before Payload starts: a refusal costs nothing.
	const password = await readSecret('Mot de passe (12 caractères au moins, rien ne s’affiche) : ')
	const confirmation = await readSecret('Mot de passe, une seconde fois : ')

	const [{ getPayload }, { default: config }] = await Promise.all([import('payload'), import('@payload-config')])
	// The schema is never changed from here: Payload connects to the tables the application built.
	const payload = await getPayload({ config: configurationWithoutSchemaChange(await config) })
	try {
		const accounts: Accounts = {
			existe: async email =>
				(await payload.count({ collection: 'admins', overrideAccess: true, where: { email: { equals: email } } }))
					.totalDocs > 0,
			creer: async data => ({ id: (await payload.create({ collection: 'admins', data, overrideAccess: true })).id }),
		}
		const { id, role } = await createAccount(accounts, request, password, confirmation)
		console.log(`Compte admin créé : identifiant ${id}, rôle ${role}.`)
		return 0
	} finally {
		await payload.destroy()
	}
}

try {
	process.exit(await principal(process.argv.slice(2)))
} catch (error) {
	if (error instanceof CreationRefused) {
		console.error(error.message)
		process.exit(1)
	}
	// An error of the database carries the values of the query: only its type is printed.
	console.error(
		`La création a échoué (${error instanceof Error ? error.name : 'erreur inconnue'}). Rien n’est affiché de plus : il pourrait porter le mot de passe.`
	)
	process.exit(3)
}

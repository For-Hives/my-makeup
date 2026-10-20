/**
 * Command line that creates an account of the admin panel (README « Créer un compte admin »).
 *
 *   bun run admin:creer <email>                   an `admin`, in the database of DATABASE_URI
 *   bun run admin:creer <email> --role=editor     an `editor` account
 *   bun run admin:creer <email> --remote-target  when DATABASE_URI is not on this machine
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
import { lireUnSecret } from './keyboard'
import { type Comptes, CreationRefusee, creerLeCompte, DRAPEAU_CIBLE_DISTANTE, lireLesArguments, USAGE } from './account'

async function principal(argv: string[]): Promise<number> {
	const demande = lireLesArguments(argv)
	if (!demande) {
		console.error(USAGE)
		return 2
	}
	// Before anything is loaded: the configuration of Payload connects to whatever DATABASE_URI names.
	const base = process.env.DATABASE_URI
	if (!base) throw new CreationRefusee('DATABASE_URI manque : la commande ne sait pas où écrire. Rien n’est écrit.')
	if (!isLocalDatabase(base) && !demande.cibleDistante)
		throw new CreationRefusee(
			`DATABASE_URI ne désigne pas une base de ce poste : la commande refuse d’y écrire. Pour une base distante, la commande le dit elle-même : ${DRAPEAU_CIBLE_DISTANTE}. Rien n’est écrit.`
		)
	// The password is asked before Payload starts: a refusal costs nothing.
	const motDePasse = await lireUnSecret('Mot de passe (12 caractères au moins, rien ne s’affiche) : ')
	const confirmation = await lireUnSecret('Mot de passe, une seconde fois : ')

	const [{ getPayload }, { default: config }] = await Promise.all([import('payload'), import('@payload-config')])
	// The schema is never changed from here: Payload connects to the tables the application built.
	const payload = await getPayload({ config: configurationWithoutSchemaChange(await config) })
	try {
		const comptes: Comptes = {
			existe: async email =>
				(await payload.count({ collection: 'admins', overrideAccess: true, where: { email: { equals: email } } }))
					.totalDocs > 0,
			creer: async data => ({ id: (await payload.create({ collection: 'admins', data, overrideAccess: true })).id }),
		}
		const { id, role } = await creerLeCompte(comptes, demande, motDePasse, confirmation)
		console.log(`Compte admin créé : identifiant ${id}, rôle ${role}.`)
		return 0
	} finally {
		await payload.destroy()
	}
}

try {
	process.exit(await principal(process.argv.slice(2)))
} catch (erreur) {
	if (erreur instanceof CreationRefusee) {
		console.error(erreur.message)
		process.exit(1)
	}
	// An error of the database carries the values of the query: only its type is printed.
	console.error(
		`La création a échoué (${erreur instanceof Error ? erreur.name : 'erreur inconnue'}). Rien n’est affiché de plus : il pourrait porter le mot de passe.`
	)
	process.exit(3)
}

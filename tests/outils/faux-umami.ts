/**
 * The fake Umami of the bench, seen from a test: read what it received, forget it.
 *
 *   const umami = fauxUmami()
 *   await umami.vider()
 *   // ... the application relays a measure ...
 *   const recus = await umami.recus()
 *
 * The instance runs in a container of the bench (compose.test.yml, service « faux-umami », code in
 * tests/outils/faux-umami/). The application is pointed at it by UMAMI_ORIGIN.
 *
 * Nothing of bun here: Playwright loads this file under Node.
 */

import { BancRefuse, type Variables } from './banc'
import type { Recu } from './faux-umami/fournisseur'

export type { Recu } from './faux-umami/fournisseur'

const HOTES_LOCAUX = ['localhost', '127.0.0.1']

export interface OutilFauxUmami {
	/** Where the fake answers. */
	adresse: string
	recus: () => Promise<Recu[]>
	vider: () => Promise<void>
	/** The sends of the type given (`event`), or all of them. */
	envois: (nom?: string) => Promise<Recu[]>
}

export function fauxUmami(variables: Variables = process.env): OutilFauxUmami {
	const adresse = variables.UMAMI_ORIGIN
	if (!adresse)
		throw new BancRefuse(
			'Aucun faux Umami n’est réglé (UMAMI_ORIGIN manque). Démarre le banc par « bun run banc:up », puis lance les tests par « bun run test:integration ».'
		)
	const url = URL.canParse(adresse) ? new URL(adresse) : undefined
	if (url?.origin !== adresse || url.protocol !== 'http:' || !HOTES_LOCAUX.includes(url.hostname))
		throw new BancRefuse(
			'UMAMI_ORIGIN ne désigne pas le faux Umami du banc, sur ce poste : rien n’est envoyé. Un test ne parle jamais à la vraie instance.'
		)

	const recus = async (): Promise<Recu[]> => {
		const reponse = await fetch(`${adresse}/_recus`)
		if (!reponse.ok) throw new BancRefuse(`Le faux Umami répond ${reponse.status} à la lecture de ses envois.`)
		return (await reponse.json()) as Recu[]
	}
	return {
		adresse,
		recus,
		vider: async () => {
			await fetch(`${adresse}/_recus`, { method: 'DELETE' })
		},
		envois: async nom => {
			const tous = await recus()
			if (nom === undefined) return tous
			return tous.filter(recu => {
				const corps = recu.corps as { payload?: { name?: unknown } } | null
				return corps?.payload?.name === nom
			})
		},
	}
}

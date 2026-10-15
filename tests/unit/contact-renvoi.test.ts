import { describe, expect, test } from 'bun:test'
import type { EtatDuMail } from '@/lib/contact/etats'
import type { MessageDeContact } from '@/lib/contact/message'
import { renvoyerLEmailDUnMessage, type StockageDuRenvoi } from '@/lib/contact/renvoi'
import { type EmailAEnvoyer, EnvoiEmailEchoue, type EnvoyerEmail } from '@/lib/emails/envoi'

/** The re-send of an admin (ticket 163), with doubles for the store and the door. The real ones: tests/integration/contact-admin.test.ts. */

const MESSAGE: MessageDeContact = {
	prenom: 'Léa',
	nom: 'Témoin',
	email: 'renvoi@example.test',
	telephone: '01 99 00 12 34',
	message: 'Bonjour.',
}

function banc(etatDeDepart: EtatDuMail | null, envoyer?: EnvoyerEmail) {
	let etat: EtatDuMail | null = etatDeDepart
	const mails: EmailAEnvoyer[] = []
	const marques: string[] = []
	const relecture: StockageDuRenvoi = {
		lire: async () => (etat === null ? null : { message: MESSAGE, etatMail: etat }),
		reserver: async () => {
			if (etat !== 'echec') return false
			etat = 'en-attente'
			return true
		},
	}
	const porte: EnvoyerEmail = envoyer ?? (async email => void mails.push(email))
	return {
		mails,
		marques,
		etat: () => etat,
		appel: (id = 1) =>
			renvoyerLEmailDUnMessage(id, {
				relecture,
				stockage: {
					creer: async () => 1,
					marquer: async (_id, nouvelEtat, statut) => {
						etat = nouvelEtat
						marques.push(`${nouvelEtat}${statut ? `:${statut}` : ''}`)
					},
				},
				envoyer: porte,
				destinataire: 'equipe@example.test',
				journal: { info: () => {}, erreur: () => {} },
			}),
	}
}

describe('Le renvoi de l’email d’un message de contact', () => {
	test('un message en échec repart : un mail vers l’équipe, réponse vers la visiteuse, la ligne passe à envoyé et transmise', async () => {
		const b = banc('echec')
		expect(await b.appel()).toEqual({ ok: true, etatMail: 'envoye' })
		expect(b.mails).toHaveLength(1)
		expect(b.mails[0]).toMatchObject({ a: 'equipe@example.test', repondreA: 'renvoi@example.test' })
		expect(b.marques).toEqual(['envoye:transmise'])
	})

	test('deux clics en même temps : un seul mail, l’autre clic apprend que le message n’est plus en échec', async () => {
		const b = banc('echec')
		const [a, c] = await Promise.all([b.appel(), b.appel()])
		expect([a.ok, c.ok].sort()).toEqual([false, true])
		expect([a, c]).toContainEqual({ ok: false, code: 'pas-en-echec' })
		expect(b.mails).toHaveLength(1)
	})

	test('un message déjà envoyé, ou en cours d’envoi, ne repart pas', async () => {
		for (const etat of ['envoye', 'en-attente'] as const) {
			const b = banc(etat)
			expect(await b.appel()).toEqual({ ok: false, code: 'pas-en-echec' })
			expect(b.mails).toEqual([])
		}
	})

	test('un message qui n’existe pas : introuvable, aucun mail', async () => {
		const b = banc(null)
		expect(await b.appel(99)).toEqual({ ok: false, code: 'introuvable' })
		expect(b.mails).toEqual([])
	})

	test('le fournisseur échoue encore : le résultat dit « échec », la ligne reste en échec et se renvoie plus tard', async () => {
		let appels = 0
		const b = banc('echec', async () => {
			appels += 1
			if (appels === 1) throw new EnvoiEmailEchoue()
		})
		expect(await b.appel()).toEqual({ ok: true, etatMail: 'echec' })
		expect(b.etat()).toBe('echec')
		expect(await b.appel()).toEqual({ ok: true, etatMail: 'envoye' })
		expect(appels).toBe(2)
	})
})

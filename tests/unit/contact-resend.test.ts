import { describe, expect, test } from 'bun:test'
import type { ContactMessage } from '@/lib/contact/message'
import { type ResendStorage, resendMessageEmail } from '@/lib/contact/resend'
import type { MailState } from '@/lib/contact/states'
import { EmailSendFailed, type EmailToSend, type SendEmail } from '@/lib/emails/send'

/** The re-send of an admin (ticket 163), with doubles for the store and the door. The real ones: tests/integration/contact-admin.test.ts. */

const MESSAGE: ContactMessage = {
	prenom: 'Léa',
	nom: 'Témoin',
	email: 'renvoi@example.test',
	telephone: '01 99 00 12 34',
	message: 'Bonjour.',
}

function bench(etatDeDepart: MailState | null, envoyer?: SendEmail) {
	let state: MailState | null = etatDeDepart
	const mails: EmailToSend[] = []
	const marks: string[] = []
	const review: ResendStorage = {
		lire: async () => (state === null ? null : { message: MESSAGE, etatMail: state }),
		reserver: async () => {
			if (state !== 'failed') return false
			state = 'pending'
			return true
		},
	}
	const door: SendEmail = envoyer ?? (async email => void mails.push(email))
	return {
		mails,
		marques: marks,
		etat: () => state,
		appel: (id = 1) =>
			resendMessageEmail(id, {
				relecture: review,
				stockage: {
					creer: async () => 1,
					marquer: async (_id, nouvelEtat, statut) => {
						state = nouvelEtat
						marks.push(`${nouvelEtat}${statut ? `:${statut}` : ''}`)
					},
				},
				envoyer: door,
				destinataire: 'equipe@example.test',
				journal: { info: () => {}, erreur: () => {} },
			}),
	}
}

describe('Le renvoi de l’email d’un message de contact', () => {
	test('un message en échec repart : un mail vers l’équipe, réponse vers la visiteuse, la ligne passe à envoyé et transmise', async () => {
		const b = bench('failed')
		expect(await b.appel()).toEqual({ ok: true, etatMail: 'envoye' })
		expect(b.mails).toHaveLength(1)
		expect(b.mails[0]).toMatchObject({ a: 'equipe@example.test', repondreA: 'renvoi@example.test' })
		expect(b.marques).toEqual(['sent:forwarded'])
	})

	test('deux clics en même temps : un seul mail, l’autre clic apprend que le message n’est plus en échec', async () => {
		const b = bench('failed')
		const [a, c] = await Promise.all([b.appel(), b.appel()])
		expect([a.ok, c.ok].sort()).toEqual([false, true])
		expect([a, c]).toContainEqual({ ok: false, code: 'pas-en-echec' })
		expect(b.mails).toHaveLength(1)
	})

	test('un message déjà envoyé, ou en cours d’envoi, ne repart pas', async () => {
		for (const state of ['sent', 'pending'] as const) {
			const b = bench(state)
			expect(await b.appel()).toEqual({ ok: false, code: 'pas-en-echec' })
			expect(b.mails).toEqual([])
		}
	})

	test('un message qui n’existe pas : introuvable, aucun mail', async () => {
		const b = bench(null)
		expect(await b.appel(99)).toEqual({ ok: false, code: 'introuvable' })
		expect(b.mails).toEqual([])
	})

	test('le fournisseur échoue encore : le résultat dit « échec », la ligne reste en échec et se renvoie plus tard', async () => {
		let calls = 0
		const b = bench('failed', async () => {
			calls += 1
			if (calls === 1) throw new EmailSendFailed()
		})
		expect(await b.appel()).toEqual({ ok: true, etatMail: 'echec' })
		expect(b.etat()).toBe('failed')
		expect(await b.appel()).toEqual({ ok: true, etatMail: 'envoye' })
		expect(calls).toBe(2)
	})
})

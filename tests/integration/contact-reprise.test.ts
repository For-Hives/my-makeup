import { afterAll, describe, expect, test } from 'bun:test'
import { stockageDePayload } from '@/lib/contact/envoi-payload'
import type { EtatDuMail } from '@/lib/contact/etats'
import { renvoyerLEmailDUnMessage, stockageDuRenvoiDePayload } from '@/lib/contact/renvoi'
import { marquerUnImportEnCours } from '@/lib/contexte-import'
import { DELAI_DE_REPRISE_MS, repriseDesMessagesBloques } from '@/lib/taches/messages-bloques'
import { lancerLesTachesQuotidiennes } from '@/lib/taches/quotidiennes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'

/**
 * A contact message whose mail never got an answer (the process stopped between the storing and the send)
 * goes from « en cours d’envoi » to « échec » by the daily task, then an admin can send it again
 * (ticket 224). The clock is simulated: the rows are written now, the task runs at a chosen moment.
 */

afterAll(viderLaBase)

async function ecrire(etatMail: EtatDuMail) {
	const payload = await payloadDeTest()
	return payload.create({
		collection: 'demandes',
		data: {
			type: 'contact',
			statut: 'nouvelle',
			etatMail,
			prenom: 'Léa',
			nom: 'Témoin',
			email: `reprise-${crypto.randomUUID()}@example.test`,
			telephone: '01 99 00 12 34',
			message: 'Un message de test.',
		},
	})
}

async function etatDe(id: number) {
	const payload = await payloadDeTest()
	const { etatMail, statut } = await payload.findByID({ collection: 'demandes', id, depth: 0 })
	return { etatMail, statut }
}

const apres = (ms: number) => new Date(Date.now() + ms)

describe('la reprise des messages restés en cours d’envoi, sur une horloge simulée', () => {
	test('avant le délai rien ne bouge ; après, seul « en cours d’envoi » passe en échec, le statut intact', async () => {
		const payload = await payloadDeTest()
		const bloque = await ecrire('en-attente')
		const envoye = await ecrire('envoye')
		const echoue = await ecrire('echec')

		const tot = await lancerLesTachesQuotidiennes(payload, apres(DELAI_DE_REPRISE_MS - 60_000), [
			repriseDesMessagesBloques,
		])
		expect(tot).toEqual([{ nom: 'reprise-messages-contact-bloques', supprimes: 0 }])
		expect(await etatDe(bloque.id)).toEqual({ etatMail: 'en-attente', statut: 'nouvelle' })

		const tard = await lancerLesTachesQuotidiennes(payload, apres(DELAI_DE_REPRISE_MS + 60_000), [
			repriseDesMessagesBloques,
		])
		expect(tard).toEqual([{ nom: 'reprise-messages-contact-bloques', supprimes: 1 }])
		expect(await etatDe(bloque.id)).toEqual({ etatMail: 'echec', statut: 'nouvelle' })
		expect(await etatDe(envoye.id)).toEqual({ etatMail: 'envoye', statut: 'nouvelle' })
		expect(await etatDe(echoue.id)).toEqual({ etatMail: 'echec', statut: 'nouvelle' })

		const encore = await lancerLesTachesQuotidiennes(payload, apres(DELAI_DE_REPRISE_MS + 120_000), [
			repriseDesMessagesBloques,
		])
		expect(encore).toEqual([{ nom: 'reprise-messages-contact-bloques', supprimes: 0 }])
	})

	test('le message repris est renvoyable par l’admin, une fois', async () => {
		const payload = await payloadDeTest()
		const bloque = await ecrire('en-attente')
		await lancerLesTachesQuotidiennes(payload, apres(DELAI_DE_REPRISE_MS + 60_000), [repriseDesMessagesBloques])
		const mails: string[] = []

		const rendu = await renvoyerLEmailDUnMessage(bloque.id, {
			relecture: stockageDuRenvoiDePayload(payload),
			stockage: stockageDePayload(payload),
			envoyer: async email => void mails.push(email.a),
			destinataire: 'equipe@example.test',
			journal: { info: () => {}, erreur: () => {} },
		})

		expect(rendu).toEqual({ ok: true, etatMail: 'envoye' })
		expect(mails).toEqual(['equipe@example.test'])
		expect(await etatDe(bloque.id)).toEqual({ etatMail: 'envoye', statut: 'transmise' })
	})

	test('pendant un import rien ne bouge', async () => {
		const payload = await payloadDeTest()
		const bloque = await ecrire('en-attente')
		const fin = marquerUnImportEnCours()
		const pendant = await lancerLesTachesQuotidiennes(payload, apres(DELAI_DE_REPRISE_MS + 60_000), [
			repriseDesMessagesBloques,
		])
		fin()
		expect(pendant).toEqual([{ nom: 'reprise-messages-contact-bloques', supprimes: 0 }])
		expect(await etatDe(bloque.id)).toEqual({ etatMail: 'en-attente', statut: 'nouvelle' })
	})
})

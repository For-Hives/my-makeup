import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createServer } from 'node:net'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { payloadStorage, saveContactMessage } from '@/lib/contact/payload-send'
import { type ContactRateLimits, createContactRateLimits } from '@/lib/contact/rate-limit'
import { transportOptions } from '@/lib/emails/relay'
import { createSendEmail, payloadSendEmail, type SendEmail } from '@/lib/emails/send'
import { serverEnv } from '@/lib/env'
import { emptySink, mailReceived, waitMail } from '../support/mailpit'
import { emptyBase, testPayload } from '../support/payload-test'

/**
 * The contact message against the real store and the mail catcher of the bench (tickets 158 and 159;
 * plan 02 I32 and I33). The mails leave by SMTP, which no HTTP simulation reaches (ticket 037): an email
 * in panne is a door that fails, or a relay that never answers. The page and the form in a browser:
 * tests/e2e/contact.spec.ts. The same lines with doubles: tests/unit/contact-send.test.ts.
 */

beforeAll(emptySink)
afterAll(async () => {
	await Promise.all([emptyBase(), emptySink()])
})

const unique = (prefixe: string) => `${prefixe}-${crypto.randomUUID()}@example.test`

/** A visitor with an address of her own, and a team address of its own: a test only ever reads what it sent. */
function visiteuse(surcharge: Record<string, string> = {}) {
	const champs: Record<string, string> = {
		prenom: 'Léa',
		nom: 'Témoin',
		email: unique('visiteuse'),
		telephone: '01 99 00 12 34',
		message: 'Bonjour,\nune question sur le site.',
		...surcharge,
	}
	return { champs, formulaire: { get: (nom: string) => champs[nom] }, equipe: unique('equipe') }
}

async function lignesDe(email: string) {
	const payload = await testPayload()
	return (
		await payload.find({ collection: 'contact-requests', where: { email: { equals: email } }, limit: 30, depth: 0 })
	).docs
}

async function envoyerLeFormulaire(
	v: ReturnType<typeof visiteuse>,
	options: { envoyer?: SendEmail; delaiMs?: number; client?: string; freins?: ContactRateLimits } = {}
) {
	const payload = await testPayload()
	const travaux: Promise<void>[] = []
	const lignes: string[] = []
	const resultat = await saveContactMessage({
		formulaire: v.formulaire,
		client: options.client ?? '203.0.113.9',
		freins: options.freins ?? createContactRateLimits(v.equipe),
		stockage: payloadStorage(payload),
		envoyer: options.envoyer ?? payloadSendEmail(payload, serverEnv()),
		destinataire: v.equipe,
		apres: travail => void travaux.push(travail()),
		journal: { info: l => void lignes.push(l), erreur: l => void lignes.push(l) },
		...(options.delaiMs !== undefined && { delaiMs: options.delaiMs }),
	})
	return { resultat, lignes, termine: () => Promise.all(travaux) }
}

describe('I32 adapté : le message est écrit avant l’envoi, puis marqué transmis', () => {
	test('la ligne existe quand le mail part ; un seul mail, réponse vers l’adresse saisie', async () => {
		const v = visiteuse()
		const payload = await testPayload()
		const porte = payloadSendEmail(payload, serverEnv())
		let ligneAuDepart: unknown[] = []
		const envoyer: SendEmail = async (email, options) => {
			ligneAuDepart = await lignesDe(v.champs.email as string)
			await porte(email, options)
		}

		const { resultat, termine } = await envoyerLeFormulaire(v, { envoyer })
		await termine()

		expect(resultat).toEqual({ ok: true })
		expect(ligneAuDepart).toHaveLength(1)
		expect(ligneAuDepart[0]).toMatchObject({ status: 'new', mailStatus: 'pending', type: 'contact' })

		const mail = await waitMail({ pour: v.equipe })
		expect(await mailReceived(v.equipe)).toHaveLength(1)
		expect(mail.sujet).toBe('Nouveau message de contact')
		expect(mail.repondreA).toEqual([{ nom: '', adresse: v.champs.email as string }])
		expect(mail.texte).toContain('une question sur le site.')
		expect(mail.texte).toContain('Message envoyé par le formulaire de contact de My Makeup.')

		const lignes = await lignesDe(v.champs.email as string)
		expect(lignes).toHaveLength(1)
		expect(lignes[0]).toMatchObject({
			firstName: 'Léa',
			lastName: 'Témoin',
			phone: '01 99 00 12 34',
			status: 'forwarded',
			mailStatus: 'sent',
		})
	})

	test('ce que la visiteuse a tapé est du texte : le HTML du mail échappe une balise', async () => {
		const v = visiteuse({ message: '<script>alert(1)</script>' })
		const { termine } = await envoyerLeFormulaire(v)
		await termine()
		const mail = await waitMail({ pour: v.equipe })
		expect(mail.html).not.toContain('<script>')
		expect(mail.html).toContain('&lt;script&gt;')
	})

	test('un envoi direct invalide ne crée aucune ligne et ne sort aucun mail', async () => {
		const payload = await testPayload()
		const avant = (await payload.count({ collection: 'contact-requests' })).totalDocs
		const v = visiteuse({ nom: '', telephone: '' })
		const { resultat, termine } = await envoyerLeFormulaire(v)
		await termine()

		expect(resultat).toMatchObject({ ok: false, code: 'donnees-invalides' })
		expect((await payload.count({ collection: 'contact-requests' })).totalDocs).toBe(avant)
		expect(await mailReceived(v.equipe)).toEqual([])
	})

	test('même sans la validation du formulaire, la collection refuse un message trop long', async () => {
		const payload = await testPayload()
		const v = visiteuse()
		await expect(
			payloadStorage(payload).creer({
				prenom: 'Léa',
				nom: 'Témoin',
				email: v.champs.email as string,
				telephone: '01 99 00 12 34',
				message: 'x'.repeat(5001),
			})
		).rejects.toThrow()
		expect(await lignesDe(v.champs.email as string)).toEqual([])
	})
})

describe('I33 adapté : un email en panne ne perd pas le message', () => {
	test('la porte d’envoi échoue : la ligne est gardée en échec, aucun mail ne part', async () => {
		const v = visiteuse()
		const lignesDuJournal: string[] = []
		// The real door, wired to a relay nobody answers on: the failure of the provider.
		const envoyer = createSendEmail({
			relais: async () => {
				throw Object.assign(new Error(`connect ECONNREFUSED ${v.equipe}`), { code: 'ECONNREFUSED' })
			},
			journal: { info: l => void lignesDuJournal.push(l), erreur: l => void lignesDuJournal.push(l) },
		})

		const { resultat, lignes, termine } = await envoyerLeFormulaire(v, { envoyer })
		await termine()

		expect(resultat).toEqual({ ok: true })
		const stockees = await lignesDe(v.champs.email as string)
		expect(stockees).toHaveLength(1)
		expect(stockees[0]).toMatchObject({ status: 'new', mailStatus: 'failed' })
		expect(await mailReceived(v.equipe)).toEqual([])
		// The log holds no field she typed, and no address.
		const journal = [...lignes, ...lignesDuJournal].join('\n')
		for (const saisi of [v.champs.email, v.equipe, 'Léa', 'Témoin', '01 99 00 12 34', 'question']) {
			expect(journal).not.toContain(saisi as string)
		}
	})

	test('un fournisseur muet : la réponse est immédiate et la ligne passe en échec en moins de 10 secondes', async () => {
		const v = visiteuse()
		// A relay that accepts the connection and says nothing, as a provider that hangs.
		const sockets = new Set<import('node:net').Socket>()
		const serveur = createServer(socket => {
			sockets.add(socket)
		})
		await new Promise<void>(resolve => serveur.listen(0, '127.0.0.1', resolve))
		const port = (serveur.address() as { port: number }).port
		try {
			const payload = await testPayload()
			const adapter = await nodemailerAdapter({
				defaultFromAddress: 'ne-pas-repondre@example.test',
				defaultFromName: 'My Makeup',
				skipVerify: true,
				transportOptions: transportOptions({
					host: '127.0.0.1',
					port,
					fromAddress: 'ne-pas-repondre@example.test',
					fromName: 'My Makeup',
				}),
			})
			const adaptateur = adapter({ payload })
			const envoyer = createSendEmail({
				relais: message => adaptateur.sendEmail(message),
				journal: { info: () => {}, erreur: () => {} },
			})

			const debut = Date.now()
			const { resultat, lignes, termine } = await envoyerLeFormulaire(v, { envoyer })
			const reponseEn = Date.now() - debut
			await termine()
			const toutEn = Date.now() - debut

			expect(resultat).toEqual({ ok: true })
			expect(reponseEn).toBeLessThan(2000)
			expect(toutEn).toBeLessThan(10_000)
			const stockees = await lignesDe(v.champs.email as string)
			expect(stockees[0]).toMatchObject({ status: 'new', mailStatus: 'failed' })
			expect(lignes.join('\n')).not.toContain(v.champs.email as string)
		} finally {
			for (const socket of sockets) socket.destroy()
			await new Promise(resolve => serveur.close(resolve))
		}
	}, 20_000)
})

describe('I34 : champ piège rempli, demande invalide ou limite atteinte : aucune ligne, aucun mail', () => {
	test('le champ piège rempli : le succès d’une visiteuse, aucune ligne, aucun mail', async () => {
		const v = visiteuse({ commentaire: 'Super site, visitez mon offre' })
		const { resultat, termine } = await envoyerLeFormulaire(v)
		await termine()

		expect(resultat).toEqual({ ok: true })
		expect(await lignesDe(v.champs.email as string)).toEqual([])
		expect(await mailReceived(v.equipe)).toEqual([])
	})

	test('la sixième demande de l’heure d’une adresse est refusée : une ligne et un mail pour chacune des cinq, aucun pour la sixième', async () => {
		const freins = createContactRateLimits(crypto.randomUUID())
		const client = '198.51.100.7'
		const envois = []
		for (let i = 0; i < 6; i++) {
			const v = visiteuse()
			const { resultat, termine } = await envoyerLeFormulaire(v, { client, freins })
			await termine()
			envois.push({ v, resultat })
		}

		for (const { v, resultat } of envois.slice(0, 5)) {
			expect(resultat).toEqual({ ok: true })
			expect(await lignesDe(v.champs.email as string)).toHaveLength(1)
		}
		const sixieme = envois[5]
		expect(sixieme?.resultat).toMatchObject({ ok: false, code: 'trop-de-messages' })
		expect(await lignesDe(sixieme?.v.champs.email as string)).toEqual([])
		expect(await mailReceived(sixieme?.v.equipe as string)).toEqual([])

		// Another address is free.
		const autre = visiteuse()
		const suite = await envoyerLeFormulaire(autre, { client: '198.51.100.8', freins })
		await suite.termine()
		expect(suite.resultat).toEqual({ ok: true })
	})

	test('la vingt et unième demande du jour pour un même email est refusée, d’où qu’elle vienne', async () => {
		const freins = createContactRateLimits(crypto.randomUUID())
		const email = unique('insistante')
		for (let i = 0; i < 20; i++) {
			const { resultat, termine } = await envoyerLeFormulaire(visiteuse({ email }), {
				client: `192.0.2.${i + 1}`,
				freins,
			})
			await termine()
			expect(resultat).toEqual({ ok: true })
		}
		const v = visiteuse({ email })
		const { resultat, termine } = await envoyerLeFormulaire(v, { client: '192.0.2.200', freins })
		await termine()

		expect(resultat).toMatchObject({ ok: false, code: 'trop-de-messages' })
		expect(await lignesDe(email)).toHaveLength(20)
		expect(await mailReceived(v.equipe)).toEqual([])
	})
})

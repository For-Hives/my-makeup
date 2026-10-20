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
function visitor(surcharge: Record<string, string> = {}) {
	const fields: Record<string, string> = {
		prenom: 'Léa',
		nom: 'Témoin',
		email: unique('visiteuse'),
		telephone: '01 99 00 12 34',
		message: 'Bonjour,\nune question sur le site.',
		...surcharge,
	}
	return { champs: fields, formulaire: { get: (nom: string) => fields[nom] }, equipe: unique('equipe') }
}

async function linesOf(email: string) {
	const payload = await testPayload()
	return (
		await payload.find({ collection: 'contact-requests', where: { email: { equals: email } }, limit: 30, depth: 0 })
	).docs
}

async function sendForm(
	v: ReturnType<typeof visitor>,
	options: { envoyer?: SendEmail; delaiMs?: number; client?: string; freins?: ContactRateLimits } = {}
) {
	const payload = await testPayload()
	const work: Promise<void>[] = []
	const lines: string[] = []
	const result = await saveContactMessage({
		formulaire: v.formulaire,
		client: options.client ?? '203.0.113.9',
		freins: options.freins ?? createContactRateLimits(v.equipe),
		stockage: payloadStorage(payload),
		envoyer: options.envoyer ?? payloadSendEmail(payload, serverEnv()),
		destinataire: v.equipe,
		apres: travail => void work.push(travail()),
		journal: { info: l => void lines.push(l), erreur: l => void lines.push(l) },
		...(options.delaiMs !== undefined && { delaiMs: options.delaiMs }),
	})
	return { resultat: result, lignes: lines, termine: () => Promise.all(work) }
}

describe('I32 adapté : le message est écrit avant l’envoi, puis marqué transmis', () => {
	test('la ligne existe quand le mail part ; un seul mail, réponse vers l’adresse saisie', async () => {
		const v = visitor()
		const payload = await testPayload()
		const carries = payloadSendEmail(payload, serverEnv())
		let lineAtStart: unknown[] = []
		const send: SendEmail = async (email, options) => {
			lineAtStart = await linesOf(v.champs.email as string)
			await carries(email, options)
		}

		const { resultat: result, termine: finished } = await sendForm(v, { envoyer: send })
		await finished()

		expect(result).toEqual({ ok: true })
		expect(lineAtStart).toHaveLength(1)
		expect(lineAtStart[0]).toMatchObject({ status: 'new', mailStatus: 'pending', type: 'contact' })

		const mail = await waitMail({ pour: v.equipe })
		expect(await mailReceived(v.equipe)).toHaveLength(1)
		expect(mail.sujet).toBe('Nouveau message de contact')
		expect(mail.repondreA).toEqual([{ nom: '', adresse: v.champs.email as string }])
		expect(mail.texte).toContain('une question sur le site.')
		expect(mail.texte).toContain('Message envoyé par le formulaire de contact de My Makeup.')

		const lines = await linesOf(v.champs.email as string)
		expect(lines).toHaveLength(1)
		expect(lines[0]).toMatchObject({
			firstName: 'Léa',
			lastName: 'Témoin',
			phone: '01 99 00 12 34',
			status: 'forwarded',
			mailStatus: 'sent',
		})
	})

	test('ce que la visiteuse a tapé est du texte : le HTML du mail échappe une balise', async () => {
		const v = visitor({ message: '<script>alert(1)</script>' })
		const { termine: finished } = await sendForm(v)
		await finished()
		const mail = await waitMail({ pour: v.equipe })
		expect(mail.html).not.toContain('<script>')
		expect(mail.html).toContain('&lt;script&gt;')
	})

	test('un envoi direct invalide ne crée aucune ligne et ne sort aucun mail', async () => {
		const payload = await testPayload()
		const before = (await payload.count({ collection: 'contact-requests' })).totalDocs
		const v = visitor({ nom: '', telephone: '' })
		const { resultat: result, termine: finished } = await sendForm(v)
		await finished()

		expect(result).toMatchObject({ ok: false, code: 'donnees-invalides' })
		expect((await payload.count({ collection: 'contact-requests' })).totalDocs).toBe(before)
		expect(await mailReceived(v.equipe)).toEqual([])
	})

	test('même sans la validation du formulaire, la collection refuse un message trop long', async () => {
		const payload = await testPayload()
		const v = visitor()
		await expect(
			payloadStorage(payload).creer({
				prenom: 'Léa',
				nom: 'Témoin',
				email: v.champs.email as string,
				telephone: '01 99 00 12 34',
				message: 'x'.repeat(5001),
			})
		).rejects.toThrow()
		expect(await linesOf(v.champs.email as string)).toEqual([])
	})
})

describe('I33 adapté : un email en panne ne perd pas le message', () => {
	test('la porte d’envoi échoue : la ligne est gardée en échec, aucun mail ne part', async () => {
		const v = visitor()
		const logLines: string[] = []
		// The real door, wired to a relay nobody answers on: the failure of the provider.
		const send = createSendEmail({
			relais: async () => {
				throw Object.assign(new Error(`connect ECONNREFUSED ${v.equipe}`), { code: 'ECONNREFUSED' })
			},
			journal: { info: l => void logLines.push(l), erreur: l => void logLines.push(l) },
		})

		const { resultat: result, lignes: lines, termine: finished } = await sendForm(v, { envoyer: send })
		await finished()

		expect(result).toEqual({ ok: true })
		const stored = await linesOf(v.champs.email as string)
		expect(stored).toHaveLength(1)
		expect(stored[0]).toMatchObject({ status: 'new', mailStatus: 'failed' })
		expect(await mailReceived(v.equipe)).toEqual([])
		// The log holds no field she typed, and no address.
		const log = [...lines, ...logLines].join('\n')
		for (const entered of [v.champs.email, v.equipe, 'Léa', 'Témoin', '01 99 00 12 34', 'question']) {
			expect(log).not.toContain(entered as string)
		}
	})

	test('un fournisseur muet : la réponse est immédiate et la ligne passe en échec en moins de 10 secondes', async () => {
		const v = visitor()
		// A relay that accepts the connection and says nothing, as a provider that hangs.
		const sockets = new Set<import('node:net').Socket>()
		const server = createServer(socket => {
			sockets.add(socket)
		})
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
		const port = (server.address() as { port: number }).port
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
			const mailAdapter = adapter({ payload })
			const send = createSendEmail({
				relais: message => mailAdapter.sendEmail(message),
				journal: { info: () => {}, erreur: () => {} },
			})

			const start = Date.now()
			const { resultat: result, lignes: lines, termine: finished } = await sendForm(v, { envoyer: send })
			const responseIn = Date.now() - start
			await finished()
			const allIn = Date.now() - start

			expect(result).toEqual({ ok: true })
			expect(responseIn).toBeLessThan(2000)
			expect(allIn).toBeLessThan(10_000)
			const stored = await linesOf(v.champs.email as string)
			expect(stored[0]).toMatchObject({ status: 'new', mailStatus: 'failed' })
			expect(lines.join('\n')).not.toContain(v.champs.email as string)
		} finally {
			for (const socket of sockets) socket.destroy()
			await new Promise(resolve => server.close(resolve))
		}
	}, 20_000)
})

describe('I34 : champ piège rempli, demande invalide ou limite atteinte : aucune ligne, aucun mail', () => {
	test('le champ piège rempli : le succès d’une visiteuse, aucune ligne, aucun mail', async () => {
		const v = visitor({ commentaire: 'Super site, visitez mon offre' })
		const { resultat: result, termine: finished } = await sendForm(v)
		await finished()

		expect(result).toEqual({ ok: true })
		expect(await linesOf(v.champs.email as string)).toEqual([])
		expect(await mailReceived(v.equipe)).toEqual([])
	})

	test('la sixième demande de l’heure d’une adresse est refusée : une ligne et un mail pour chacune des cinq, aucun pour la sixième', async () => {
		const rateLimits = createContactRateLimits(crypto.randomUUID())
		const client = '198.51.100.7'
		const uploads = []
		for (let i = 0; i < 6; i++) {
			const v = visitor()
			const { resultat: result, termine: finished } = await sendForm(v, { client, freins: rateLimits })
			await finished()
			uploads.push({ v, resultat: result })
		}

		for (const { v, resultat: result } of uploads.slice(0, 5)) {
			expect(result).toEqual({ ok: true })
			expect(await linesOf(v.champs.email as string)).toHaveLength(1)
		}
		const sixth = uploads[5]
		expect(sixth?.resultat).toMatchObject({ ok: false, code: 'trop-de-messages' })
		expect(await linesOf(sixth?.v.champs.email as string)).toEqual([])
		expect(await mailReceived(sixth?.v.equipe as string)).toEqual([])

		// Another address is free.
		const other = visitor()
		const suite = await sendForm(other, { client: '198.51.100.8', freins: rateLimits })
		await suite.termine()
		expect(suite.resultat).toEqual({ ok: true })
	})

	test('la vingt et unième demande du jour pour un même email est refusée, d’où qu’elle vienne', async () => {
		const rateLimits = createContactRateLimits(crypto.randomUUID())
		const email = unique('insistante')
		for (let i = 0; i < 20; i++) {
			const { resultat: result, termine: finished } = await sendForm(visitor({ email }), {
				client: `192.0.2.${i + 1}`,
				freins: rateLimits,
			})
			await finished()
			expect(result).toEqual({ ok: true })
		}
		const v = visitor({ email })
		const { resultat: result, termine: finished } = await sendForm(v, { client: '192.0.2.200', freins: rateLimits })
		await finished()

		expect(result).toMatchObject({ ok: false, code: 'trop-de-messages' })
		expect(await linesOf(email)).toHaveLength(20)
		expect(await mailReceived(v.equipe)).toEqual([])
	})
})

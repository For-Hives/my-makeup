import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createServer } from 'node:net'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { composerEmail } from '@/lib/emails/layout'
import { transportOptions } from '@/lib/emails/relay'
import { createSendEmail, EmailSendFailed, payloadSendEmail } from '@/lib/emails/send'
import { serverEnv } from '@/lib/env'
import { IMPORT_CONTEXT } from '@/lib/import-context'
import { countMails, emptySink, mailLink, mailReceived, waitMail } from '../support/mailpit'
import { testPayload } from '../support/payload-test'

/** The address the application of the bench is served from: where the link of a mail must lead. */
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? ''

/** An address of its own for each mail: a test only ever reads what it sent. */
const fictionalUrl = (nom: string): string => `${nom}-${crypto.randomUUID()}@example.test`

const content = {
	sujet: 'Confirme ton adresse',
	titre: 'Bienvenue sur My Makeup',
	paragraphes: ['Un clic et ton compte est prêt.'],
	action: { libelle: 'Confirmer mon adresse', chemin: '/auth/confirmer?code=jeton-factice-0123' },
}

/** A port of this machine nothing listens on: asked from the system, then given back. */
async function closedPort(): Promise<number> {
	const server = createServer()
	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
	const url = server.address()
	await new Promise(resolve => server.close(resolve))
	if (url === null || typeof url === 'string') throw new Error('aucun port libre')
	return url.port
}

beforeAll(emptySink)
afterAll(emptySink)

describe('un email transactionnel part de la v3 et se lit dans le capteur du banc (ticket 073)', () => {
	test('objet, expéditeur, lien absolu, texte et HTML se relisent tels qu’ils sont partis', async () => {
		const payload = await testPayload()
		const env = serverEnv()
		const send = payloadSendEmail(payload, env)
		const url = fictionalUrl('envoi')

		await send({ a: url, ...composerEmail(content, SITE) })

		const mail = await waitMail({ pour: url })
		expect(mail.sujet).toBe('Confirme ton adresse')
		expect(mail.de).toEqual({ nom: env.mail?.fromName ?? '', adresse: env.mail?.fromAddress ?? '' })
		expect(mail.de.adresse).toEndWith('@example.test')
		expect(mail.destinataires).toEqual([{ nom: '', adresse: url }])

		const link = mailLink(mail, '/auth/confirmer')
		expect(link).toBe(`${SITE}/auth/confirmer?code=jeton-factice-0123`)
		expect(link).toMatch(/^https?:\/\//)
		expect(mail.texte).toContain(`Confirmer mon adresse : ${link}`)
		expect(mail.texte).toContain('Bienvenue sur My Makeup')
		expect(mail.texte).toContain('Tu peux l’ignorer.')
		expect(mail.html).toContain(`href="${link}"`)
		expect(mail.html).toContain('<html lang="fr">')
	})

	test('avec le contexte d’import, rien ne part', async () => {
		const payload = await testPayload()
		const send = payloadSendEmail(payload, serverEnv())
		const url = fictionalUrl('import')
		const before = await countMails()

		await send({ a: url, ...composerEmail(content, SITE) }, { context: IMPORT_CONTEXT })
		// A mail that was going to arrive has arrived by now; a second one proves the catcher is alive.
		const sentinel = fictionalUrl('temoin')
		await send({ a: sentinel, ...composerEmail(content, SITE) })
		await waitMail({ pour: sentinel })

		expect(await mailReceived(url)).toEqual([])
		expect(await countMails()).toBe(before + 1)
	})

	test('un relais qui ne répond pas : une erreur lisible, ni adresse ni jeton dans le journal', async () => {
		const payload = await testPayload()
		const dead = nodemailerAdapter({
			defaultFromAddress: 'ne-pas-repondre@example.test',
			defaultFromName: 'My Makeup',
			skipVerify: true,
			transportOptions: transportOptions({
				host: '127.0.0.1',
				port: await closedPort(),
				fromAddress: 'ne-pas-repondre@example.test',
				fromName: 'My Makeup',
			}),
		})
		const mailAdapter = (await dead)({ payload })
		const lines: string[] = []
		const send = createSendEmail({
			relais: message => mailAdapter.sendEmail(message),
			journal: { info: ligne => lines.push(ligne), erreur: ligne => lines.push(ligne) },
		})
		const url = fictionalUrl('echec')

		const error = await send({ a: url, ...composerEmail(content, SITE) }).then(
			() => undefined,
			(e: unknown) => e
		)

		expect(error).toBeInstanceOf(EmailSendFailed)
		const all = [(error as Error).message, ...lines].join('\n')
		for (const secret of [url, 'jeton-factice', '127.0.0.1', 'Confirme']) expect(all).not.toContain(secret)
		expect(lines).toHaveLength(1)
	})
})

describe('un relais qui se tait en route', () => {
	test('la porte rend une erreur lisible dans un délai borné, avec une seule ligne de journal', async () => {
		// It answers the greeting and EHLO, then says nothing: the case nodemailer waits ten minutes on.
		const server = createServer(socket => {
			socket.write('220 relais.exemple.test ESMTP\r\n')
			socket.once('data', () => socket.write('250 relais.exemple.test\r\n'))
			socket.on('error', () => undefined)
		})
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
		const port = (server.address() as { port: number }).port
		try {
			const payload = await testPayload()
			const adapter = await nodemailerAdapter({
				defaultFromAddress: 'ne-pas-repondre@example.test',
				defaultFromName: 'My Makeup',
				skipVerify: true,
				transportOptions: {
					...transportOptions({
						host: '127.0.0.1',
						port,
						fromAddress: 'ne-pas-repondre@example.test',
						fromName: 'My Makeup',
					}),
					// Short for the test, same mechanism as the real delay (asserted in the unit tests).
					socketTimeout: 1500,
				},
			})
			const mailAdapter = adapter({ payload })
			const lines: string[] = []
			const send = createSendEmail({
				relais: message => mailAdapter.sendEmail(message),
				journal: { info: ligne => lines.push(ligne), erreur: ligne => lines.push(ligne) },
			})
			const url = fictionalUrl('muet')
			const start = Date.now()
			const error = await send({ a: url, ...composerEmail(content, SITE) }).then(
				() => undefined,
				(e: unknown) => e
			)
			expect(error).toBeInstanceOf(EmailSendFailed)
			expect(Date.now() - start).toBeLessThan(8000)
			expect(lines).toHaveLength(1)
			for (const secret of [url, '127.0.0.1', 'Confirme']) expect(lines.join('\n')).not.toContain(secret)
		} finally {
			await new Promise(resolve => server.close(resolve))
		}
	}, 15_000)
})

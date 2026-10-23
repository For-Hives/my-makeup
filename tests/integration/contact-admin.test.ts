import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { payloadStorage } from '@/lib/contact/payload-send'
import { serverEnv } from '@/lib/env'
import { createAccount } from '../support/account-factory'
import { emptySink, mailReceived } from '../support/mailpit'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'

/**
 * The admin side of the contact messages (ticket 163; plan 02 E58, in its server half): the status
 * cycle kept by the collection, and the re-send of a mail in `echec`, once however many clicks. The
 * panel itself, in a browser: tests/e2e/admin-messages-contact.spec.ts. The access of every role is in
 * the matrix (tests/integration/payload-access.test.ts).
 */

beforeAll(emptySink)
afterAll(async () => {
	await Promise.all([emptyBase(), emptySink()])
})

const unique = () => `visiteuse-${crypto.randomUUID()}@example.test`

/** A stored message, the way the form stores it. `failed`: its mail did not leave. */
async function messageInBase(etatMail: 'failed' | 'sent' = 'failed') {
	const payload = await testPayload()
	const storage = payloadStorage(payload)
	const email = unique()
	const id = await storage.creer({
		prenom: 'Léa',
		nom: 'Témoin',
		email,
		telephone: '01 99 00 12 34',
		message: 'Bonjour, une question sur le site.',
	})
	await storage.marquer(id, etatMail)
	return { id, email, payload }
}

const mailsFor = async (email: string) =>
	(await mailReceived(serverEnv().contactTo)).filter(mail => mail.repondreA.some(({ adresse }) => adresse === email))

describe('Le cycle des statuts, tenu par la collection', () => {
	test('un admin marque un message répondu, puis spam ; il ne revient pas de « répondue » à « transmise »', async () => {
		const { id } = await messageInBase('sent')
		const { session } = await createAccount('admin')
		const headers = session.enTetes
		const status = async () =>
			((await (await testPayload()).findByID({ collection: 'contact-requests', id, depth: 0 })) as { status: string })
				.status

		expect(
			(await callRest('PATCH', `/api/contact-requests/${id}`, { enTetes: headers, corps: { status: 'answered' } }))
				.statut
		).toBe(200)
		expect(await status()).toBe('answered')

		const refusal = await callRest('PATCH', `/api/contact-requests/${id}`, {
			enTetes: headers,
			corps: { status: 'forwarded' },
		})
		expect(refusal.statut).toBe(400)
		expect(refusal.texte).toContain('ne peut pas passer à')
		expect(await status()).toBe('answered')

		expect(
			(await callRest('PATCH', `/api/contact-requests/${id}`, { enTetes: headers, corps: { status: 'spam' } })).statut
		).toBe(200)
		expect(await status()).toBe('spam')
	})

	test('un admin ne réécrit pas la date de réception, ni ne dit « transmise » pour un email en échec', async () => {
		const { id, payload } = await messageInBase('failed')
		const { session } = await createAccount('admin')
		const headers = session.enTetes
		const before = (await payload.findByID({ collection: 'contact-requests', id, depth: 0 })).createdAt

		const date = await callRest('PATCH', `/api/contact-requests/${id}`, {
			enTetes: headers,
			corps: { createdAt: '2000-01-01T00:00:00.000Z', status: 'answered' },
		})
		expect(date.statut).toBe(200)
		const after = await payload.findByID({ collection: 'contact-requests', id, depth: 0 })
		expect(after.createdAt).toBe(before)
		expect(after.status).toBe('answered')

		const other = await messageInBase('failed')
		const refusal = await callRest('PATCH', `/api/contact-requests/${other.id}`, {
			enTetes: headers,
			corps: { status: 'forwarded' },
		})
		expect(refusal.statut).toBe(400)
		expect(refusal.texte).toContain('que lorsque son email est parti')
		expect(await other.payload.findByID({ collection: 'contact-requests', id: other.id, depth: 0 })).toMatchObject({
			status: 'new',
			mailStatus: 'failed',
		})
	})

	test('un « le mail est parti » tardif du serveur ne ramène pas un message répondu à « transmise »', async () => {
		const { id, payload } = await messageInBase('failed')
		const { session } = await createAccount('admin')
		await callRest('PATCH', `/api/contact-requests/${id}`, {
			enTetes: session.enTetes,
			corps: { status: 'answered' },
		})

		await payloadStorage(payload).marquer(id, 'sent', 'forwarded')

		const line = await payload.findByID({ collection: 'contact-requests', id, depth: 0 })
		expect(line).toMatchObject({ status: 'answered', mailStatus: 'sent' })
	})
})

describe('E58 (côté serveur) : le renvoi de l’email d’un message en échec', () => {
	test('l’admin renvoie : un mail vers l’équipe, réponse vers la visiteuse, la ligne passe à envoyé et transmise', async () => {
		const { id, email, payload } = await messageInBase('failed')
		const { session } = await createAccount('admin')

		const response = await callRest('POST', `/api/contact-requests/${id}/resend`, { enTetes: session.enTetes })

		expect(response.statut).toBe(200)
		expect(response.corps).toEqual({ mailStatus: 'sent' })
		const mails = await mailsFor(email)
		expect(mails).toHaveLength(1)
		expect(mails[0]?.sujet).toBe('Nouveau message de contact')
		expect(mails[0]?.texte).toContain('une question sur le site.')
		expect(await payload.findByID({ collection: 'contact-requests', id, depth: 0 })).toMatchObject({
			status: 'forwarded',
			mailStatus: 'sent',
		})
	})

	test('double clic : deux demandes en même temps, un seul email, l’autre apprend que le message n’est plus en échec', async () => {
		const { id, email } = await messageInBase('failed')
		const { session } = await createAccount('admin')

		const [a, b] = await Promise.all([
			callRest('POST', `/api/contact-requests/${id}/resend`, { enTetes: session.enTetes }),
			callRest('POST', `/api/contact-requests/${id}/resend`, { enTetes: session.enTetes }),
		])

		expect([a.statut, b.statut].sort()).toEqual([200, 409])
		expect(await mailsFor(email)).toHaveLength(1)
		// A click that comes later still sends nothing.
		expect((await callRest('POST', `/api/contact-requests/${id}/resend`, { enTetes: session.enTetes })).statut).toBe(
			409
		)
		expect(await mailsFor(email)).toHaveLength(1)
	})

	test('un message dont l’email est déjà parti ne repart pas ; un message inconnu répond 404', async () => {
		const { id, email } = await messageInBase('sent')
		const { session } = await createAccount('admin')

		expect((await callRest('POST', `/api/contact-requests/${id}/resend`, { enTetes: session.enTetes })).statut).toBe(
			409
		)
		expect(
			(await callRest('POST', `/api/contact-requests/${id + 100000}/resend`, { enTetes: session.enTetes })).statut
		).toBe(404)
		expect((await callRest('POST', '/api/contact-requests/abc/resend', { enTetes: session.enTetes })).statut).toBe(404)
		expect(await mailsFor(email)).toEqual([])
	})

	test('ni la rédaction, ni une maquilleuse, ni un visiteur ne renvoient : 403, aucun mail', async () => {
		const { id, email } = await messageInBase('failed')
		const [editor, artist] = await Promise.all([createAccount('redaction'), createAccount('maquilleuse')])

		for (const headers of [editor.session.enTetes, artist.session.enTetes, undefined])
			expect(
				(await callRest('POST', `/api/contact-requests/${id}/resend`, headers ? { enTetes: headers } : {})).statut
			).toBe(403)

		expect(await mailsFor(email)).toEqual([])
		const line = await (await testPayload()).findByID({ collection: 'contact-requests', id, depth: 0 })
		expect(line.mailStatus).toBe('failed')
	})
})

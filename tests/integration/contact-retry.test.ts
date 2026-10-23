import { afterAll, describe, expect, test } from 'bun:test'
import { payloadStorage } from '@/lib/contact/payload-send'
import { payloadResendStorage, resendMessageEmail } from '@/lib/contact/resend'
import type { MailState } from '@/lib/contact/states'
import { markImportInProgress } from '@/lib/import-context'
import { runDailyTasks } from '@/lib/tasks/daily'
import { RETRY_DELAY_MS, retryStuckMessages } from '@/lib/tasks/stuck-messages'
import { emptyBase, testPayload } from '../support/payload-test'

/**
 * A contact message whose mail never got an answer (the process stopped between the storing and the send)
 * goes from « en cours d’envoi » to « échec » by the daily task, then an admin can send it again
 * (ticket 224). The clock is simulated: the rows are written now, the task runs at a chosen moment.
 */

afterAll(emptyBase)

async function write(etatMail: MailState) {
	const payload = await testPayload()
	return payload.create({
		collection: 'contact-requests',
		data: {
			type: 'contact',
			status: 'new',
			mailStatus: etatMail,
			firstName: 'Léa',
			lastName: 'Témoin',
			email: `reprise-${crypto.randomUUID()}@example.test`,
			phone: '01 99 00 12 34',
			message: 'Un message de test.',
		},
	})
}

async function stateOf(id: number) {
	const payload = await testPayload()
	const { mailStatus, status } = await payload.findByID({ collection: 'contact-requests', id, depth: 0 })
	return { mailStatus, status }
}

const after = (ms: number) => new Date(Date.now() + ms)

describe('la reprise des messages restés en cours d’envoi, sur une horloge simulée', () => {
	test('avant le délai rien ne bouge ; après, seul « en cours d’envoi » passe en échec, le statut intact', async () => {
		const payload = await testPayload()
		const blocked = await write('pending')
		const sent = await write('sent')
		const failed = await write('failed')

		const early = await runDailyTasks(payload, after(RETRY_DELAY_MS - 60_000), [retryStuckMessages])
		expect(early).toEqual([{ nom: 'reprise-messages-contact-bloques', supprimes: 0 }])
		expect(await stateOf(blocked.id)).toEqual({ mailStatus: 'pending', status: 'new' })

		const late = await runDailyTasks(payload, after(RETRY_DELAY_MS + 60_000), [retryStuckMessages])
		expect(late).toEqual([{ nom: 'reprise-messages-contact-bloques', supprimes: 1 }])
		expect(await stateOf(blocked.id)).toEqual({ mailStatus: 'failed', status: 'new' })
		expect(await stateOf(sent.id)).toEqual({ mailStatus: 'sent', status: 'new' })
		expect(await stateOf(failed.id)).toEqual({ mailStatus: 'failed', status: 'new' })

		const still = await runDailyTasks(payload, after(RETRY_DELAY_MS + 120_000), [retryStuckMessages])
		expect(still).toEqual([{ nom: 'reprise-messages-contact-bloques', supprimes: 0 }])
	})

	test('le message repris est renvoyable par l’admin, une fois', async () => {
		const payload = await testPayload()
		const blocked = await write('pending')
		await runDailyTasks(payload, after(RETRY_DELAY_MS + 60_000), [retryStuckMessages])
		const mails: string[] = []

		const rendered = await resendMessageEmail(blocked.id, {
			relecture: payloadResendStorage(payload),
			stockage: payloadStorage(payload),
			envoyer: async email => void mails.push(email.a),
			destinataire: 'equipe@example.test',
			journal: { info: () => {}, erreur: () => {} },
		})

		expect(rendered).toEqual({ ok: true, etatMail: 'envoye' })
		expect(mails).toEqual(['equipe@example.test'])
		expect(await stateOf(blocked.id)).toEqual({ mailStatus: 'sent', status: 'forwarded' })
	})

	test('pendant un import rien ne bouge', async () => {
		const payload = await testPayload()
		const blocked = await write('pending')
		const end = markImportInProgress()
		const during = await runDailyTasks(payload, after(RETRY_DELAY_MS + 60_000), [retryStuckMessages])
		end()
		expect(during).toEqual([{ nom: 'reprise-messages-contact-bloques', supprimes: 0 }])
		expect(await stateOf(blocked.id)).toEqual({ mailStatus: 'pending', status: 'new' })
	})
})

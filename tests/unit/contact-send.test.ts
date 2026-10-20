import { describe, expect, test } from 'bun:test'
import type { ContactMessage } from '@/lib/contact/message'
import { dispatch, type RequestStorage, saveContactMessage } from '@/lib/contact/payload-send'
import { createContactRateLimits } from '@/lib/contact/rate-limit'
import type { MailState, RequestStatus } from '@/lib/contact/states'
import { EmailSendFailed, type EmailToSend, NO_RELAY, type SendEmail } from '@/lib/emails/send'

/**
 * The contact message, server side, with doubles for the store and the mail door (tickets 158 and 159; plan 02
 * I32 and I33 adapted: the mails leave by SMTP, which no HTTP simulation reaches, so the door is the
 * dependency that fails or stays silent). The same lines against the real store, the real door and the mail
 * catcher are in tests/integration/contact.test.ts.
 */

// Unique markers: a log line that holds one of them quotes what the visitor typed.
const MARKERS = {
	prenom: 'PRENOMMARQUEUR',
	nom: 'NOMMARQUEUR',
	email: 'mq-adresse@example.test',
	telephone: '0199TELMARQUEUR',
	message: 'MESSAGEMARQUEUR',
}
const form = (surcharge: Record<string, unknown> = {}) => {
	const values: Record<string, unknown> = { ...MARKERS, ...surcharge }
	return { get: (nom: string) => values[nom] }
}

function bench(options: { creer?: () => Promise<number>; envoyer?: SendEmail; delaiMs?: number } = {}) {
	const events: string[] = []
	const lines: string[] = []
	const baseLines = new Map<number, { message: ContactMessage; etatMail: MailState; statut: RequestStatus }>()
	const mails: EmailToSend[] = []
	const jobs: Promise<void>[] = []
	const storage: RequestStorage = {
		creer: async message => {
			events.push('creer')
			const id = (await options.creer?.()) ?? baseLines.size + 1
			baseLines.set(id, { message, etatMail: 'pending', statut: 'new' })
			return id
		},
		marquer: async (id, etatMail, statut) => {
			events.push(`marquer:${etatMail}`)
			const line = baseLines.get(id)
			if (line) baseLines.set(id, { ...line, etatMail, statut: statut ?? line.statut })
		},
	}
	const send: SendEmail =
		options.envoyer ??
		(async email => {
			events.push('envoyer')
			mails.push(email)
		})
	const rateLimits = createContactRateLimits(crypto.randomUUID())
	const entries = (surcharge: Record<string, unknown> = {}) => ({
		formulaire: form(surcharge),
		stockage: storage,
		envoyer: send,
		destinataire: 'equipe@example.test',
		client: '203.0.113.9',
		freins: rateLimits,
		apres: (travail: () => Promise<void>) => void jobs.push(travail()),
		journal: { info: (l: string) => void lines.push(l), erreur: (l: string) => void lines.push(l) },
		...(options.delaiMs !== undefined && { delaiMs: options.delaiMs }),
	})
	return {
		entrees: entries,
		freins: rateLimits,
		evenements: events,
		lignes: lines,
		lignesDeLaBase: baseLines,
		mails,
		termine: () => Promise.all(jobs),
	}
}

describe('I32 adapté : la ligne est écrite avant l’envoi, puis marquée transmise', () => {
	test('l’ordre : la ligne, puis le mail, puis l’état', async () => {
		const b = bench()
		const result = await saveContactMessage(b.entrees())
		await b.termine()

		expect(result).toEqual({ ok: true })
		expect(b.evenements).toEqual(['creer', 'envoyer', 'marquer:sent'])
		expect([...b.lignesDeLaBase.values()]).toEqual([{ message: MARKERS, etatMail: 'sent', statut: 'forwarded' }])
	})

	test('un seul mail, à l’équipe, avec l’adresse saisie en réponse, et le sujet sans rien de saisi', async () => {
		const b = bench()
		await saveContactMessage(b.entrees())
		await b.termine()

		expect(b.mails).toHaveLength(1)
		expect(b.mails[0]).toMatchObject({
			a: 'equipe@example.test',
			repondreA: MARKERS.email,
			sujet: 'Nouveau message de contact',
		})
	})

	test('la réponse part avant le mail : le visiteur n’attend jamais le relais', async () => {
		const b = bench()
		const entries = { ...b.entrees(), apres: () => {} }
		await saveContactMessage(entries)
		expect(b.evenements).toEqual(['creer'])
	})
})

describe('un message invalide ne crée aucune ligne et n’envoie rien', () => {
	test.each([
		['un champ vide', { nom: '' }],
		['une adresse invalide', { email: 'pas-une-adresse' }],
		['un message trop long', { message: 'x'.repeat(5001) }],
		[
			'aucun champ du tout',
			{ prenom: undefined, nom: undefined, email: undefined, telephone: undefined, message: undefined },
		],
	])('%s', async (_cas, surcharge) => {
		const b = bench()
		const result = await saveContactMessage(b.entrees(surcharge))
		await b.termine()

		expect(result.ok).toBe(false)
		expect(result).toMatchObject({ code: 'donnees-invalides' })
		expect(b.evenements).toEqual([])
		expect(b.mails).toEqual([])
	})
})

describe('I33 adapté : un email en panne ne perd pas le message', () => {
	const inFailure: SendEmail = async () => {
		throw new EmailSendFailed()
	}

	test('la porte échoue : la ligne reste, marquée en échec, la visiteuse a sa confirmation', async () => {
		const b = bench({ envoyer: inFailure })
		const result = await saveContactMessage(b.entrees())
		await b.termine()

		expect(result).toEqual({ ok: true })
		expect([...b.lignesDeLaBase.values()]).toEqual([{ message: MARKERS, etatMail: 'failed', statut: 'new' }])
		expect(b.mails).toEqual([])
	})

	test('un relais muet : la réponse n’attend pas, et passé le délai la ligne est en échec', async () => {
		const b = bench({ envoyer: () => new Promise(() => {}), delaiMs: 50 })
		const startedAt = Date.now()
		const result = await saveContactMessage(b.entrees())
		const responseIn = Date.now() - startedAt
		await b.termine()
		const all = Date.now() - startedAt

		expect(result).toEqual({ ok: true })
		expect(responseIn).toBeLessThan(40)
		expect(all).toBeGreaterThanOrEqual(45)
		expect(all).toBeLessThan(1000)
		expect([...b.lignesDeLaBase.values()][0]).toMatchObject({ etatMail: 'failed', statut: 'new' })
	})

	test('le délai par défaut est sous les 10 secondes qu’une visiteuse attend au plus', async () => {
		const { SEND_TIMEOUT_MS: UPLOAD_DELAY_MS } = await import('@/lib/contact/payload-send')
		expect(UPLOAD_DELAY_MS).toBeLessThan(10_000)
	})

	test('un relais lent qui finit par envoyer : la ligne dit envoyé', async () => {
		let leave: () => void = () => {}
		const b = bench({
			envoyer: () =>
				new Promise<void>(fin => {
					leave = fin
				}),
			delaiMs: 20,
		})
		await saveContactMessage(b.entrees())
		await b.termine()
		expect([...b.lignesDeLaBase.values()][0]).toMatchObject({ etatMail: 'failed' })

		leave()
		await new Promise(r => setTimeout(r, 20))
		expect([...b.lignesDeLaBase.values()][0]).toMatchObject({ etatMail: 'sent', statut: 'forwarded' })
	})

	test('l’état qui ne peut pas s’écrire ne fait pas échouer la réponse', async () => {
		const b = bench({ envoyer: inFailure })
		const entries = b.entrees()
		entries.stockage.marquer = async () => {
			throw new Error('base en panne')
		}
		expect(await saveContactMessage(entries)).toEqual({ ok: true })
		await b.termine()
	})
})

describe('ticket 224 : sans relais d’envoi, le message n’est pas dit transmis', () => {
	const withoutRelay: SendEmail = async () => NO_RELAY

	test('la porte signale qu’il n’y a pas de relais : la ligne reste en échec, jamais transmise, et le journal le dit', async () => {
		const b = bench({ envoyer: withoutRelay })
		const result = await saveContactMessage(b.entrees())
		await b.termine()

		expect(result).toEqual({ ok: true })
		expect([...b.lignesDeLaBase.values()]).toEqual([{ message: MARKERS, etatMail: 'failed', statut: 'new' }])
		expect(b.lignes.join('\n')).toContain('aucun relais')
		for (const marker of Object.values(MARKERS)) expect(b.lignes.join('\n')).not.toContain(marker)
	})

	test('l’envoi de l’admin sans relais rend « echec » aussi, et rien n’est marqué envoyé', async () => {
		const b = bench({ envoyer: withoutRelay })
		const state = await dispatch(1, MARKERS, { ...b.entrees(), stockage: b.entrees().stockage })

		expect(state).toBe('echec')
		expect(b.evenements).not.toContain('marquer:sent')
	})
})

describe('une ligne qui ne s’enregistre pas : rien ne part, la visiteuse l’apprend', () => {
	test('le stockage échoue : aucun mail, un échec d’enregistrement', async () => {
		const b = bench({
			creer: async () => {
				throw Object.assign(new Error('insert into demandes (...) values (MESSAGEMARQUEUR)'), { code: '08006' })
			},
		})
		const result = await saveContactMessage(b.entrees())
		await b.termine()

		expect(result).toEqual({ ok: false, code: 'enregistrement-impossible' })
		expect(b.mails).toEqual([])
		expect(b.evenements).toEqual(['creer'])
	})
})

describe('le journal ne garde rien de ce qui a été saisi', () => {
	const testCase: [string, Parameters<typeof bench>[0]][] = [
		['un envoi réussi', {}],
		[
			'un email en panne dont l’erreur cite l’adresse',
			{
				envoyer: async () => {
					throw Object.assign(new Error(`Recipient ${MARKERS.email} refused MESSAGEMARQUEUR`), { code: 'EENVELOPE' })
				},
			},
		],
		[
			'un stockage dont l’erreur cite les valeurs',
			{
				creer: async () => {
					throw Object.assign(new Error(`insert ... values (${MARKERS.prenom}, ${MARKERS.message})`), {
						name: 'DrizzleQueryError',
					})
				},
			},
		],
		['un relais muet', { envoyer: () => new Promise(() => {}), delaiMs: 10 }],
	]
	test.each(testCase)('%s', async (_nom, options) => {
		const b = bench(options)
		await saveContactMessage(b.entrees())
		await b.termine()

		for (const line of b.lignes) for (const typed of Object.values(MARKERS)) expect(line).not.toContain(typed)
		// The marker words themselves, whatever their case.
		for (const line of b.lignes) expect(line).not.toMatch(/MARQUEUR|mq-adresse/i)
	})
})

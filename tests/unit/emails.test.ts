import { describe, expect, test } from 'bun:test'
import { absoluteLink, composerEmail, EMAIL_FOOTER, InvalidEmail } from '@/lib/emails/layout'
import { adapterWithoutRelay, RELAY_TIMEOUT_MS, transportOptions } from '@/lib/emails/relay'
import { createSendEmail, EmailSendFailed, type Log, NO_RELAY, type RelayMessage } from '@/lib/emails/send'
import { IMPORT_CONTEXT } from '@/lib/import-context'

// Made-up values only: the domain is reserved for tests, the token is not one.
const SITE = 'https://site.exemple.test'
const ADDRESS = 'personne-temoin@example.test'
const TOKEN = 'jeton-temoin-0123456789'

const content = {
	sujet: 'Confirme ton adresse',
	titre: 'Bienvenue sur My Makeup',
	paragraphes: ['Un clic et ton compte est prêt.', 'Ce lien vaut 24 heures.'],
	action: { libelle: 'Confirmer mon adresse', chemin: `/auth/confirmer?code=${TOKEN}` },
}

function savedLog() {
	const lines: string[] = []
	const log: Log = { info: ligne => lines.push(ligne), erreur: ligne => lines.push(ligne) }
	return { journal: log, lignes: lines }
}

describe('le gabarit commun compose un email en français, texte et HTML', () => {
	test('le lien est absolu et se retrouve dans le texte et dans le HTML', () => {
		const email = composerEmail(content, SITE)

		expect(email.lien).toBe(`${SITE}/auth/confirmer?code=${TOKEN}`)
		expect(email.texte).toContain(`Confirmer mon adresse : ${email.lien}`)
		expect(email.html).toContain(`href="${email.lien}"`)
		expect(email.html).toContain('<html lang="fr">')
		expect(email.sujet).toBe('Confirme ton adresse')
	})

	test('le texte et le HTML disent la même chose : titre, paragraphes, pied', () => {
		const email = composerEmail(content, SITE)

		for (const phrase of [
			'Bienvenue sur My Makeup',
			'Un clic et ton compte est prêt.',
			'Ce lien vaut 24 heures.',
			EMAIL_FOOTER,
		]) {
			expect(email.texte).toContain(phrase)
			expect(email.html).toContain(phrase)
		}
	})

	test('un email sans bouton n’a pas de lien', () => {
		const email = composerEmail({ ...content, action: undefined }, SITE)
		expect(email.lien).toBeUndefined()
		expect(email.html).not.toContain('<a ')
	})

	test('un texte qui contient du HTML est échappé, partout', () => {
		const email = composerEmail(
			{
				...content,
				titre: '<script>x</script>',
				paragraphes: ['a & b <b>c</b> "d"'],
				action: { libelle: '"><i>', chemin: '/a?b=1&c=2' },
			},
			SITE
		)

		expect(email.html).not.toContain('<script>')
		expect(email.html).not.toContain('<b>c</b>')
		expect(email.html).toContain('a &amp; b &lt;b&gt;c&lt;/b&gt; &quot;d&quot;')
		expect(email.html).toContain('href="https://site.exemple.test/a?b=1&amp;c=2"')
	})

	test.each([
		['https://autre.test/x'],
		['//autre.test/x'],
		['/\\autre.test'],
		['auth/connexion'],
		['/a b'],
		['/a\r\nBcc: x@y.test'],
		[''],
	])('le chemin « %s » n’est pas un chemin du site : refusé, sans le recopier', chemin => {
		let error: unknown
		try {
			absoluteLink(SITE, chemin)
		} catch (e) {
			error = e
		}
		expect(error).toBeInstanceOf(InvalidEmail)
		expect((error as Error).message).not.toContain('autre.test')
	})

	test.each([['ftp://exemple.test'], ['exemple.test'], ['']])('l’adresse du site « %s » est refusée', site => {
		expect(() => absoluteLink(site, '/x')).toThrow(InvalidEmail)
	})

	test('un sujet sur deux lignes, un titre vide ou un email sans phrase sont refusés', () => {
		expect(() => composerEmail({ ...content, sujet: 'a\r\nBcc: x@y.test' }, SITE)).toThrow(InvalidEmail)
		expect(() => composerEmail({ ...content, titre: '  ' }, SITE)).toThrow(InvalidEmail)
		expect(() => composerEmail({ ...content, paragraphes: [' '] }, SITE)).toThrow(InvalidEmail)
	})
})

describe('le point d’envoi unique', () => {
	const email = { a: ADDRESS, ...composerEmail(content, SITE) }

	test('il passe le message au relais, avec le texte et le HTML', async () => {
		const received: RelayMessage[] = []
		const { journal: log, lignes: lines } = savedLog()
		const send = createSendEmail({ relais: async message => void received.push(message), journal: log })

		await send(email)

		expect(received).toEqual([{ to: ADDRESS, subject: email.sujet, text: email.texte, html: email.html }])
		expect(lines).toEqual([])
	})

	test('avec le contexte d’import, rien ne part et rien n’est écrit', async () => {
		const received: RelayMessage[] = []
		const { journal: log, lignes: lines } = savedLog()
		const send = createSendEmail({ relais: async message => void received.push(message), journal: log })

		await send(email, { context: IMPORT_CONTEXT })
		await send({ ...email, a: 'illisible' }, { context: IMPORT_CONTEXT })

		expect(received).toEqual([])
		expect(lines).toEqual([])
	})

	test('sans relais : rien ne part, aucune erreur, une ligne de journal sans adresse ni lien', async () => {
		const { journal: log, lignes: lines } = savedLog()
		const send = createSendEmail({ relais: undefined, journal: log })

		const issue = await send(email)

		expect(issue).toBe(NO_RELAY)
		expect(lines).toHaveLength(1)
		expect(lines.join('\n')).not.toContain(ADDRESS)
		expect(lines.join('\n')).not.toContain(TOKEN)
	})

	test('un relais en échec : une erreur lisible pour l’appelant, ni adresse ni jeton dans le journal', async () => {
		const { journal: log, lignes: lines } = savedLog()
		const send = createSendEmail({
			relais: async () => {
				throw Object.assign(new Error(`Recipient ${ADDRESS} refused, link ${SITE}/auth/confirmer?code=${TOKEN}`), {
					code: 'ECONNREFUSED',
				})
			},
			journal: log,
		})

		const error = await send(email).then(
			() => undefined,
			(e: unknown) => e
		)

		expect(error).toBeInstanceOf(EmailSendFailed)
		const { message } = error as Error
		expect(message).toBe('L’email n’a pas pu partir : le service d’envoi ne répond pas. Réessaie dans un instant.')
		expect((error as Error).cause).toBeUndefined()
		const all = [message, ...lines].join('\n')
		for (const secret of [ADDRESS, TOKEN, 'confirmer', email.sujet]) expect(all).not.toContain(secret)
		expect(lines).toEqual(['Un email n’est pas parti (nature : ECONNREFUSED).'])
	})

	test('une erreur sans code connu : nature « inconnue », rien d’autre', async () => {
		const { journal: log, lignes: lines } = savedLog()
		const send = createSendEmail({
			relais: async () => {
				throw new Error(ADDRESS)
			},
			journal: log,
		})

		await expect(send(email)).rejects.toBeInstanceOf(EmailSendFailed)
		expect(lines).toEqual(['Un email n’est pas parti (nature : inconnue).'])
	})

	test.each([
		['illisible'],
		['a@b'],
		['a b@c.test'],
		['a@c.test\r\nBcc: x@y.test'],
	])('le destinataire « %s » est refusé avant le relais', async destinataire => {
		const received: RelayMessage[] = []
		const send = createSendEmail({
			relais: async message => void received.push(message),
			journal: savedLog().journal,
		})

		await expect(send({ ...email, a: destinataire })).rejects.toBeInstanceOf(InvalidEmail)
		expect(received).toEqual([])
	})
})

describe('les réglages de transport du relais', () => {
	const base = { host: 'relais.exemple.test', fromAddress: 'a@example.test', fromName: 'My Makeup' }

	test('le capteur du banc : tel quel, sans identifiant ni chiffrement', () => {
		expect(transportOptions({ ...base, host: '127.0.0.1', port: 1025 })).toEqual({
			host: '127.0.0.1',
			port: 1025,
			secure: false,
			connectionTimeout: RELAY_TIMEOUT_MS,
			greetingTimeout: RELAY_TIMEOUT_MS,
			socketTimeout: RELAY_TIMEOUT_MS,
		})
	})

	test('un relais muet est abandonné vite : les trois délais de nodemailer sont réglés, et courts', () => {
		const options = transportOptions({ ...base, port: 465, auth: { user: 'resend', pass: 'cle-temoin' } })
		for (const delay of [options.connectionTimeout, options.greetingTimeout, options.socketTimeout]) {
			expect(delay).toBe(RELAY_TIMEOUT_MS)
		}
		expect(RELAY_TIMEOUT_MS).toBeLessThanOrEqual(15_000)
	})

	test('sans relais, un mail de Payload ne laisse qu’une ligne sans adresse ni objet', async () => {
		const lines: string[] = []
		const adapter = adapterWithoutRelay({ payload: { logger: { warn: (l: string) => lines.push(l) } } as never })
		await adapter.sendEmail({ to: 'membre@example.test', subject: 'Confirme ton adresse', html: '<p>x</p>' })
		expect(lines).toHaveLength(1)
		expect(lines[0]).not.toContain('membre@example.test')
		expect(lines[0]).not.toContain('Confirme')
	})

	test('un relais avec identifiant : le port 465 est chiffré d’emblée, les autres exigent TLS', () => {
		const auth = { user: 'resend', pass: 'cle-temoin' }
		expect(transportOptions({ ...base, port: 465, auth })).toEqual({
			host: base.host,
			port: 465,
			secure: true,
			requireTLS: true,
			auth,
			connectionTimeout: RELAY_TIMEOUT_MS,
			greetingTimeout: RELAY_TIMEOUT_MS,
			socketTimeout: RELAY_TIMEOUT_MS,
		})
		expect(transportOptions({ ...base, port: 587, auth })).toMatchObject({ secure: false, requireTLS: true, auth })
	})
})

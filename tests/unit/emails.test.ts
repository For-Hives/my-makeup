import { describe, expect, test } from 'bun:test'
import { CONTEXTE_IMPORT } from '@/lib/contexte-import'
import { AUCUN_RELAIS, creerEnvoiEmail, EnvoiEmailEchoue, type Journal, type MessageDuRelais } from '@/lib/emails/envoi'
import { composerEmail, EmailInvalide, lienAbsolu, PIED_DE_EMAIL } from '@/lib/emails/gabarit'
import { adaptateurSansRelais, DELAI_DU_RELAIS_MS, optionsDeTransport } from '@/lib/emails/relais'

// Made-up values only: the domain is reserved for tests, the token is not one.
const SITE = 'https://site.exemple.test'
const ADRESSE = 'personne-temoin@example.test'
const JETON = 'jeton-temoin-0123456789'

const contenu = {
	sujet: 'Confirme ton adresse',
	titre: 'Bienvenue sur My Makeup',
	paragraphes: ['Un clic et ton compte est prêt.', 'Ce lien vaut 24 heures.'],
	action: { libelle: 'Confirmer mon adresse', chemin: `/auth/confirmer?code=${JETON}` },
}

function journalEnregistre() {
	const lignes: string[] = []
	const journal: Journal = { info: ligne => lignes.push(ligne), erreur: ligne => lignes.push(ligne) }
	return { journal, lignes }
}

describe('le gabarit commun compose un email en français, texte et HTML', () => {
	test('le lien est absolu et se retrouve dans le texte et dans le HTML', () => {
		const email = composerEmail(contenu, SITE)

		expect(email.lien).toBe(`${SITE}/auth/confirmer?code=${JETON}`)
		expect(email.texte).toContain(`Confirmer mon adresse : ${email.lien}`)
		expect(email.html).toContain(`href="${email.lien}"`)
		expect(email.html).toContain('<html lang="fr">')
		expect(email.sujet).toBe('Confirme ton adresse')
	})

	test('le texte et le HTML disent la même chose : titre, paragraphes, pied', () => {
		const email = composerEmail(contenu, SITE)

		for (const phrase of [
			'Bienvenue sur My Makeup',
			'Un clic et ton compte est prêt.',
			'Ce lien vaut 24 heures.',
			PIED_DE_EMAIL,
		]) {
			expect(email.texte).toContain(phrase)
			expect(email.html).toContain(phrase)
		}
	})

	test('un email sans bouton n’a pas de lien', () => {
		const email = composerEmail({ ...contenu, action: undefined }, SITE)
		expect(email.lien).toBeUndefined()
		expect(email.html).not.toContain('<a ')
	})

	test('un texte qui contient du HTML est échappé, partout', () => {
		const email = composerEmail(
			{
				...contenu,
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
		let erreur: unknown
		try {
			lienAbsolu(SITE, chemin)
		} catch (e) {
			erreur = e
		}
		expect(erreur).toBeInstanceOf(EmailInvalide)
		expect((erreur as Error).message).not.toContain('autre.test')
	})

	test.each([['ftp://exemple.test'], ['exemple.test'], ['']])('l’adresse du site « %s » est refusée', site => {
		expect(() => lienAbsolu(site, '/x')).toThrow(EmailInvalide)
	})

	test('un sujet sur deux lignes, un titre vide ou un email sans phrase sont refusés', () => {
		expect(() => composerEmail({ ...contenu, sujet: 'a\r\nBcc: x@y.test' }, SITE)).toThrow(EmailInvalide)
		expect(() => composerEmail({ ...contenu, titre: '  ' }, SITE)).toThrow(EmailInvalide)
		expect(() => composerEmail({ ...contenu, paragraphes: [' '] }, SITE)).toThrow(EmailInvalide)
	})
})

describe('le point d’envoi unique', () => {
	const email = { a: ADRESSE, ...composerEmail(contenu, SITE) }

	test('il passe le message au relais, avec le texte et le HTML', async () => {
		const reçus: MessageDuRelais[] = []
		const { journal, lignes } = journalEnregistre()
		const envoyer = creerEnvoiEmail({ relais: async message => void reçus.push(message), journal })

		await envoyer(email)

		expect(reçus).toEqual([{ to: ADRESSE, subject: email.sujet, text: email.texte, html: email.html }])
		expect(lignes).toEqual([])
	})

	test('avec le contexte d’import, rien ne part et rien n’est écrit', async () => {
		const reçus: MessageDuRelais[] = []
		const { journal, lignes } = journalEnregistre()
		const envoyer = creerEnvoiEmail({ relais: async message => void reçus.push(message), journal })

		await envoyer(email, { context: CONTEXTE_IMPORT })
		await envoyer({ ...email, a: 'illisible' }, { context: CONTEXTE_IMPORT })

		expect(reçus).toEqual([])
		expect(lignes).toEqual([])
	})

	test('sans relais : rien ne part, aucune erreur, une ligne de journal sans adresse ni lien', async () => {
		const { journal, lignes } = journalEnregistre()
		const envoyer = creerEnvoiEmail({ relais: undefined, journal })

		const issue = await envoyer(email)

		expect(issue).toBe(AUCUN_RELAIS)
		expect(lignes).toHaveLength(1)
		expect(lignes.join('\n')).not.toContain(ADRESSE)
		expect(lignes.join('\n')).not.toContain(JETON)
	})

	test('un relais en échec : une erreur lisible pour l’appelant, ni adresse ni jeton dans le journal', async () => {
		const { journal, lignes } = journalEnregistre()
		const envoyer = creerEnvoiEmail({
			relais: async () => {
				throw Object.assign(new Error(`Recipient ${ADRESSE} refused, link ${SITE}/auth/confirmer?code=${JETON}`), {
					code: 'ECONNREFUSED',
				})
			},
			journal,
		})

		const erreur = await envoyer(email).then(
			() => undefined,
			(e: unknown) => e
		)

		expect(erreur).toBeInstanceOf(EnvoiEmailEchoue)
		const { message } = erreur as Error
		expect(message).toBe('L’email n’a pas pu partir : le service d’envoi ne répond pas. Réessaie dans un instant.')
		expect((erreur as Error).cause).toBeUndefined()
		const tout = [message, ...lignes].join('\n')
		for (const secret of [ADRESSE, JETON, 'confirmer', email.sujet]) expect(tout).not.toContain(secret)
		expect(lignes).toEqual(['Un email n’est pas parti (nature : ECONNREFUSED).'])
	})

	test('une erreur sans code connu : nature « inconnue », rien d’autre', async () => {
		const { journal, lignes } = journalEnregistre()
		const envoyer = creerEnvoiEmail({
			relais: async () => {
				throw new Error(ADRESSE)
			},
			journal,
		})

		await expect(envoyer(email)).rejects.toBeInstanceOf(EnvoiEmailEchoue)
		expect(lignes).toEqual(['Un email n’est pas parti (nature : inconnue).'])
	})

	test.each([
		['illisible'],
		['a@b'],
		['a b@c.test'],
		['a@c.test\r\nBcc: x@y.test'],
	])('le destinataire « %s » est refusé avant le relais', async destinataire => {
		const reçus: MessageDuRelais[] = []
		const envoyer = creerEnvoiEmail({
			relais: async message => void reçus.push(message),
			journal: journalEnregistre().journal,
		})

		await expect(envoyer({ ...email, a: destinataire })).rejects.toBeInstanceOf(EmailInvalide)
		expect(reçus).toEqual([])
	})
})

describe('les réglages de transport du relais', () => {
	const base = { host: 'relais.exemple.test', fromAddress: 'a@example.test', fromName: 'My Makeup' }

	test('le capteur du banc : tel quel, sans identifiant ni chiffrement', () => {
		expect(optionsDeTransport({ ...base, host: '127.0.0.1', port: 1025 })).toEqual({
			host: '127.0.0.1',
			port: 1025,
			secure: false,
			connectionTimeout: DELAI_DU_RELAIS_MS,
			greetingTimeout: DELAI_DU_RELAIS_MS,
			socketTimeout: DELAI_DU_RELAIS_MS,
		})
	})

	test('un relais muet est abandonné vite : les trois délais de nodemailer sont réglés, et courts', () => {
		const options = optionsDeTransport({ ...base, port: 465, auth: { user: 'resend', pass: 'cle-temoin' } })
		for (const delai of [options.connectionTimeout, options.greetingTimeout, options.socketTimeout]) {
			expect(delai).toBe(DELAI_DU_RELAIS_MS)
		}
		expect(DELAI_DU_RELAIS_MS).toBeLessThanOrEqual(15_000)
	})

	test('sans relais, un mail de Payload ne laisse qu’une ligne sans adresse ni objet', async () => {
		const lignes: string[] = []
		const adaptateur = adaptateurSansRelais({ payload: { logger: { warn: (l: string) => lignes.push(l) } } as never })
		await adaptateur.sendEmail({ to: 'membre@example.test', subject: 'Confirme ton adresse', html: '<p>x</p>' })
		expect(lignes).toHaveLength(1)
		expect(lignes[0]).not.toContain('membre@example.test')
		expect(lignes[0]).not.toContain('Confirme')
	})

	test('un relais avec identifiant : le port 465 est chiffré d’emblée, les autres exigent TLS', () => {
		const auth = { user: 'resend', pass: 'cle-temoin' }
		expect(optionsDeTransport({ ...base, port: 465, auth })).toEqual({
			host: base.host,
			port: 465,
			secure: true,
			requireTLS: true,
			auth,
			connectionTimeout: DELAI_DU_RELAIS_MS,
			greetingTimeout: DELAI_DU_RELAIS_MS,
			socketTimeout: DELAI_DU_RELAIS_MS,
		})
		expect(optionsDeTransport({ ...base, port: 587, auth })).toMatchObject({ secure: false, requireTLS: true, auth })
	})
})

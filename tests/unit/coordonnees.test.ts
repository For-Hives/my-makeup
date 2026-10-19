import { describe, expect, test } from 'bun:test'
import {
	consentementApres,
	groupeVideSiNul,
	MESSAGES_DES_COORDONNEES,
	validerEmailDeContact,
	validerLienDeReseau,
	validerTelephone,
} from '@/lib/profil/coordonnees'

/** The networks and contact details of a profile, and the trace of the consent (ticket 042). */

describe('Ce que le serveur accepte, avec les messages de l’ancien site', () => {
	test('vide : accepté partout', () => {
		for (const valider of [validerLienDeReseau, validerTelephone, validerEmailDeContact])
			expect([null, undefined, ''].map(valider)).toEqual([true, true, true])
	})

	test('un téléphone de 20 caractères passe ; de 21, refusé en français', () => {
		expect(validerTelephone('+33 6 39 98 12 34')).toBe(true)
		expect(validerTelephone('0'.repeat(20))).toBe(true)
		expect(validerTelephone('0'.repeat(21))).toBe('Le numéro de téléphone ne doit pas dépasser 20 caractères.')
	})

	test.each([
		['sans arobase', 'contact.example.test'],
		['sans domaine', 'contact@'],
		['avec une espace', 'con tact@example.test'],
		['deux arobases', 'a@b@example.test'],
	])('un email mal formé (%s) : refusé en français', (_cas, email) => {
		expect(validerEmailDeContact(email)).toBe('Veuillez entrer un email valide.')
	})

	test('un email bien formé passe ; au-delà de 200 caractères, refusé', () => {
		expect(validerEmailDeContact('contact@example.test')).toBe(true)
		const long = `${'a'.repeat(60)}@${'b'.repeat(60)}.${'c'.repeat(60)}.${'d'.repeat(20)}.test`
		expect(long.length).toBeGreaterThan(200)
		expect(validerEmailDeContact(long)).toBe(MESSAGES_DES_COORDONNEES.emailTropLong)
	})

	test('un lien de réseau : 200 caractères au plus, sans contrôle de forme', () => {
		expect(validerLienDeReseau('https://example.test/une-page')).toBe(true)
		expect(validerLienDeReseau('@un_pseudo')).toBe(true)
		expect(validerLienDeReseau(`https://example.test/${'a'.repeat(200)}`)).toBe(
			"L'URL ne doit pas dépasser 200 caractères."
		)
	})

	test.each([
		['https', 'https://example.test/une-page'],
		['http', 'http://example.test'],
		['http en majuscules', 'HTTPS://EXAMPLE.TEST/PAGE'],
		['sans protocole, un pseudo', '@un_pseudo'],
		['sans protocole, un domaine', 'www.example.test/une-page'],
		['un texte libre avec deux-points', 'Instagram : un_pseudo'],
		['une adresse relative au protocole', '//example.test/une-page'],
	])('un lien en http, en https ou sans protocole passe (%s)', (_cas, lien) => {
		expect(validerLienDeReseau(lien)).toBe(true)
	})

	test.each([
		['javascript', 'javascript:alert(document.cookie)'],
		['javascript en majuscules', 'JavaScript:alert(1)'],
		['javascript précédé d’espaces', '  javascript:alert(1)'],
		['javascript coupé par une tabulation', 'java\tscript:alert(1)'],
		['data', 'data:text/html,<script>alert(1)</script>'],
		['vbscript', 'vbscript:msgbox(1)'],
		['file', 'file:///etc/passwd'],
		['mailto', 'mailto:contact@example.test'],
	])('un lien qui nomme un autre protocole est refusé en français (%s)', (_cas, lien) => {
		expect(validerLienDeReseau(lien)).toBe(MESSAGES_DES_COORDONNEES.lienSansProtocoleWeb)
		expect(MESSAGES_DES_COORDONNEES.lienSansProtocoleWeb).toBe('Ce lien doit commencer par http:// ou https://.')
	})
})

describe('La trace du consentement : posée par le serveur', () => {
	const maintenant = new Date('2026-10-14T08:00:00.000Z')
	const autreDate = '2026-01-01T00:00:00.000Z'

	test('fermées : ni date ni source, même si on en envoie', () => {
		expect(
			consentementApres({
				avant: true,
				donnees: { publicContact: false, consentedAt: autreDate, consentSource: 'artist' },
				compte: 'pros',
				maintenant,
			})
		).toEqual({ consentedAt: null, consentSource: null })
	})

	test('ouvertes par la maquilleuse : la date du serveur, la source « maquilleuse »', () => {
		expect(
			consentementApres({
				avant: false,
				donnees: { publicContact: true, consentedAt: null },
				compte: 'pros',
				maintenant,
			})
		).toEqual({ consentedAt: maintenant.toISOString(), consentSource: 'artist' })
	})

	test('ouvertes par un admin : la date du serveur, la source « admin »', () => {
		expect(consentementApres({ avant: false, donnees: { publicContact: true }, compte: 'admins', maintenant })).toEqual(
			{
				consentedAt: maintenant.toISOString(),
				consentSource: 'admin',
			}
		)
	})

	test('déjà ouvertes : la trace ne bouge pas', () => {
		expect(
			consentementApres({
				avant: true,
				donnees: { publicContact: true, consentedAt: autreDate, consentSource: 'import' },
				compte: 'pros',
				maintenant,
			})
		).toEqual({ consentedAt: autreDate, consentSource: 'import' })
	})

	test('ouvertes à la création par le serveur sans compte : la date et la source données, sinon l’heure et « import »', () => {
		expect(
			consentementApres({
				avant: undefined,
				donnees: { publicContact: true, consentedAt: autreDate, consentSource: 'import' },
				compte: undefined,
				maintenant,
			})
		).toEqual({ consentedAt: autreDate, consentSource: 'import' })
		expect(
			consentementApres({ avant: undefined, donnees: { publicContact: true }, compte: undefined, maintenant })
		).toEqual({ consentedAt: maintenant.toISOString(), consentSource: 'import' })
	})
})

describe('Un groupe envoyé à null (ticket 224)', () => {
	test('devient le groupe vide ; tout autre contenu est rendu tel quel', () => {
		expect(groupeVideSiNul(null, ['telephone', 'email'])).toEqual({ telephone: null, email: null })
		const groupe = { telephone: '06 39 98 12 34' }
		expect(groupeVideSiNul(groupe, ['telephone', 'email'])).toBe(groupe)
		expect(groupeVideSiNul(undefined, ['telephone'])).toBeUndefined()
		expect(groupeVideSiNul('texte', ['telephone'])).toBe('texte')
	})
})

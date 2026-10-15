import { describe, expect, test } from 'bun:test'
import { LIMITES_DU_CONTACT, saisieDuContact, validerLeMessage } from '@/lib/contact/message'
import { contenuEmailContact, SUJET_DU_CONTACT } from '@/lib/emails/contact'
import { creerEnvoiEmail, type Journal, type MessageDuRelais } from '@/lib/emails/envoi'
import { composerEmail, EmailInvalide, PIED_DE_EMAIL } from '@/lib/emails/gabarit'

/**
 * The rules of the contact form and the mail to the team (ticket 158; plan 02 U76 adapted).
 * Made-up values only: the domain is reserved for tests, the phone number is in the fiction range.
 */

const SITE = 'https://preprod.exemple.test'

const champs = (surcharge: Record<string, unknown> = {}) => {
	const valeurs: Record<string, unknown> = {
		prenom: 'Léa',
		nom: 'Témoin',
		email: 'lea.temoin@example.test',
		telephone: '01 99 00 12 34',
		message: 'Bonjour,\nune question sur le site.',
		...surcharge,
	}
	return { get: (nom: string) => valeurs[nom] }
}

describe('les cinq champs du formulaire, avec les limites du site en ligne', () => {
	test('une saisie complète est acceptée, rognée de ses espaces', () => {
		const verifie = validerLeMessage(champs({ prenom: '  Léa  ', message: '  Bonjour  ' }))
		expect(verifie).toEqual({
			ok: true,
			message: {
				prenom: 'Léa',
				nom: 'Témoin',
				email: 'lea.temoin@example.test',
				telephone: '01 99 00 12 34',
				message: 'Bonjour',
			},
		})
	})

	test('un champ vide ou fait d’espaces dit sa phrase, dans les mots du site en ligne', () => {
		const verifie = validerLeMessage(champs({ prenom: '', nom: '   ', telephone: undefined, message: '' }))
		expect(verifie).toEqual({
			ok: false,
			erreurs: {
				prenom: 'Le prénom est requis',
				nom: 'Le nom est requis',
				telephone: 'Le numéro de téléphone est requis',
				message: 'Le message est requis',
			},
		})
	})

	test.each([
		['prenom', 'Le prénom ne doit pas dépasser 100 caractères'],
		['nom', 'Le nom ne doit pas dépasser 100 caractères'],
		['telephone', 'Le numéro de téléphone ne doit pas dépasser 30 caractères'],
		['message', 'Le message ne doit pas dépasser 5000 caractères'],
	] as const)('« %s » : la limite est comptée au caractère près', (champ, phrase) => {
		const limite = LIMITES_DU_CONTACT[champ]
		expect(validerLeMessage(champs({ [champ]: 'x'.repeat(limite) })).ok).toBe(true)
		expect(validerLeMessage(champs({ [champ]: 'x'.repeat(limite + 1) }))).toEqual({
			ok: false,
			erreurs: { [champ]: phrase },
		})
	})

	test.each([
		['sans arobase', 'lea.example.test'],
		['sans domaine', 'lea@'],
		['avec une virgule', 'lea@example.test,autre@example.test'],
		['avec un nom', 'Léa <lea@example.test>'],
		['avec un saut de ligne', 'lea@example.test\nBcc: autre@example.test'],
		['sans extension', 'lea@exemple'],
	])('une adresse %s est refusée : « L’e-mail est invalide »', (_cas, email) => {
		expect(validerLeMessage(champs({ email }))).toEqual({ ok: false, erreurs: { email: 'L’e-mail est invalide' } })
	})

	test('une adresse trop longue dit sa limite', () => {
		const email = `${'a'.repeat(250)}@example.test`
		expect(validerLeMessage(champs({ email }))).toEqual({
			ok: false,
			erreurs: { email: 'L’e-mail ne doit pas dépasser 254 caractères' },
		})
	})

	test('une valeur qui n’est pas un texte (un fichier, un nombre) compte pour un champ vide', () => {
		const verifie = validerLeMessage(champs({ nom: new Blob(['x']), telephone: 12 }))
		expect(verifie.ok).toBe(false)
	})

	test('un caractère nul est retiré : la base le refuserait', () => {
		expect(saisieDuContact(champs({ message: 'a\u0000b' })).message).toBe('ab')
	})
})

describe('le mail à l’équipe (U76 adapté)', () => {
	const message = {
		prenom: 'Léa',
		nom: 'Témoin',
		email: 'lea.temoin@example.test',
		telephone: '01 99 00 12 34',
		message: 'Bonjour,\n<script>alert(1)</script>\n\nMerci.',
	}

	test('le sujet est celui du site en ligne et ne contient rien de ce qui a été saisi', () => {
		const email = composerEmail(contenuEmailContact(message), SITE)
		expect(email.sujet).toBe(SUJET_DU_CONTACT)
		for (const saisi of Object.values(message).flatMap(valeur => valeur.split('\n').filter(Boolean)))
			expect(email.sujet).not.toContain(saisi)
	})

	test('le texte dit les cinq champs, et le HTML échappe ce qui a été saisi', () => {
		const email = composerEmail(contenuEmailContact(message), SITE)
		for (const ligne of [
			'Nom : Témoin',
			'Prénom : Léa',
			'Email : lea.temoin@example.test',
			'Numéro de téléphone : 01 99 00 12 34',
			'Bonjour,',
			'Merci.',
		])
			expect(email.texte).toContain(ligne)
		expect(email.html).not.toContain('<script>')
		expect(email.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
	})

	test('le pied dit d’où vient le message, à la place du pied des mails automatiques', () => {
		const email = composerEmail(contenuEmailContact(message), SITE)
		expect(email.texte).toContain('Message envoyé par le formulaire de contact de My Makeup.')
		expect(email.texte).not.toContain(PIED_DE_EMAIL)
		expect(email.html).toContain('Message envoyé par le formulaire de contact de My Makeup.')
	})
})

describe('la porte d’envoi porte l’adresse de réponse', () => {
	const journal: Journal = { info: () => {}, erreur: () => {} }
	const email = { a: 'equipe@example.test', sujet: 'Sujet', texte: 'Texte', html: '<p>Texte</p>' }

	test('l’adresse saisie part en replyTo, et sans elle la clé n’existe pas', async () => {
		const envoyes: MessageDuRelais[] = []
		const envoyer = creerEnvoiEmail({ relais: async message => void envoyes.push(message), journal })

		await envoyer({ ...email, repondreA: 'lea.temoin@example.test' })
		await envoyer(email)

		expect(envoyes[0]?.replyTo).toBe('lea.temoin@example.test')
		expect(envoyes[1] && 'replyTo' in envoyes[1]).toBe(false)
	})

	test.each([
		'lea@example.test\nBcc: autre@example.test',
		'Léa <lea@example.test>',
		'lea@example.test, autre@example.test',
		'"lea"@example.test',
	])('une adresse de réponse qui pourrait écrire un en-tête est refusée avant le relais : %j', async repondreA => {
		let appels = 0
		const envoyer = creerEnvoiEmail({
			relais: async () => {
				appels++
			},
			journal,
		})
		await expect(envoyer({ ...email, repondreA })).rejects.toBeInstanceOf(EmailInvalide)
		expect(appels).toBe(0)
	})
})

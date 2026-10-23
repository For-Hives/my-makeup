import { describe, expect, test } from 'bun:test'
import { CONTACT_LIMITS, contactFormInput, validateMessage } from '@/lib/contact/message'
import { CONTACT_SUBJECT, contactEmailContent } from '@/lib/emails/contact'
import { composerEmail, EMAIL_FOOTER, InvalidEmail } from '@/lib/emails/layout'
import { createSendEmail, type Log, type RelayMessage } from '@/lib/emails/send'

/**
 * The rules of the contact form and the mail to the team (ticket 158; plan 02 U76 adapted).
 * Made-up values only: the domain is reserved for tests, the phone number is in the fiction range.
 */

const SITE = 'https://site.exemple.test'

const fields = (surcharge: Record<string, unknown> = {}) => {
	const values: Record<string, unknown> = {
		prenom: 'Léa',
		nom: 'Témoin',
		email: 'lea.temoin@example.test',
		telephone: '01 99 00 12 34',
		message: 'Bonjour,\nune question sur le site.',
		...surcharge,
	}
	return { get: (nom: string) => values[nom] }
}

describe('les cinq champs du formulaire, avec les limites du site en ligne', () => {
	test('une saisie complète est acceptée, rognée de ses espaces', () => {
		const verified = validateMessage(fields({ prenom: '  Léa  ', message: '  Bonjour  ' }))
		expect(verified).toEqual({
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

	test('305 : le téléphone est facultatif ; l’e-mail invalide est toujours refusé', () => {
		const without = validateMessage(fields({ telephone: undefined }))
		expect(without).toEqual({ ok: true, message: expect.objectContaining({ telephone: '' }) })
		expect(validateMessage(fields({ telephone: '   ' })).ok).toBe(true)
		expect(validateMessage(fields({ telephone: undefined, email: 'pas-une-adresse' }))).toEqual({
			ok: false,
			erreurs: { email: 'L’e-mail est invalide' },
		})
		expect(validateMessage(fields({ telephone: '01 99 00 12 34' })).ok).toBe(true)
	})

	test('un champ vide ou fait d’espaces dit sa phrase, dans les mots du site en ligne', () => {
		const verified = validateMessage(fields({ prenom: '', nom: '   ', telephone: undefined, message: '' }))
		expect(verified).toEqual({
			ok: false,
			erreurs: {
				prenom: 'Le prénom est requis',
				nom: 'Le nom est requis',
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
		const limit = CONTACT_LIMITS[champ]
		expect(validateMessage(fields({ [champ]: 'x'.repeat(limit) })).ok).toBe(true)
		expect(validateMessage(fields({ [champ]: 'x'.repeat(limit + 1) }))).toEqual({
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
		expect(validateMessage(fields({ email }))).toEqual({ ok: false, erreurs: { email: 'L’e-mail est invalide' } })
	})

	test('une adresse trop longue dit sa limite', () => {
		const email = `${'a'.repeat(250)}@example.test`
		expect(validateMessage(fields({ email }))).toEqual({
			ok: false,
			erreurs: { email: 'L’e-mail ne doit pas dépasser 254 caractères' },
		})
	})

	test('une valeur qui n’est pas un texte (un fichier, un nombre) compte pour un champ vide', () => {
		const verified = validateMessage(fields({ nom: new Blob(['x']), telephone: 12 }))
		expect(verified.ok).toBe(false)
	})

	test('un caractère nul est retiré : la base le refuserait', () => {
		expect(contactFormInput(fields({ message: 'a\u0000b' })).message).toBe('ab')
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
		const email = composerEmail(contactEmailContent(message), SITE)
		expect(email.sujet).toBe(CONTACT_SUBJECT)
		for (const typed of Object.values(message).flatMap(valeur => valeur.split('\n').filter(Boolean)))
			expect(email.sujet).not.toContain(typed)
	})

	test('le texte dit les cinq champs, et le HTML échappe ce qui a été saisi', () => {
		const email = composerEmail(contactEmailContent(message), SITE)
		for (const line of [
			'Nom : Témoin',
			'Prénom : Léa',
			'Email : lea.temoin@example.test',
			'Numéro de téléphone : 01 99 00 12 34',
			'Bonjour,',
			'Merci.',
		])
			expect(email.texte).toContain(line)
		expect(email.html).not.toContain('<script>')
		expect(email.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
	})

	test('le pied dit d’où vient le message, à la place du pied des mails automatiques', () => {
		const email = composerEmail(contactEmailContent(message), SITE)
		expect(email.texte).toContain('Message envoyé par le formulaire de contact de My Makeup.')
		expect(email.texte).not.toContain(EMAIL_FOOTER)
		expect(email.html).toContain('Message envoyé par le formulaire de contact de My Makeup.')
	})
})

describe('la porte d’envoi porte l’adresse de réponse', () => {
	const log: Log = { info: () => {}, erreur: () => {} }
	const email = { a: 'equipe@example.test', sujet: 'Sujet', texte: 'Texte', html: '<p>Texte</p>' }

	test('l’adresse saisie part en replyTo, et sans elle la clé n’existe pas', async () => {
		const sent: RelayMessage[] = []
		const send = createSendEmail({ relais: async message => void sent.push(message), journal: log })

		await send({ ...email, repondreA: 'lea.temoin@example.test' })
		await send(email)

		expect(sent[0]?.replyTo).toBe('lea.temoin@example.test')
		expect(sent[1] && 'replyTo' in sent[1]).toBe(false)
	})

	test.each([
		'lea@example.test\nBcc: autre@example.test',
		'Léa <lea@example.test>',
		'lea@example.test, autre@example.test',
		'"lea"@example.test',
	])('une adresse de réponse qui pourrait écrire un en-tête est refusée avant le relais : %j', async repondreA => {
		let calls = 0
		const send = createSendEmail({
			relais: async () => {
				calls++
			},
			journal: log,
		})
		await expect(send({ ...email, repondreA })).rejects.toBeInstanceOf(InvalidEmail)
		expect(calls).toBe(0)
	})
})

import { describe, expect, test } from 'bun:test'
import { REPLY_SUBJECT, replyMailto } from '../../src/lib/contact/reply'

/** Ticket 308: the link « Répondre par email » of a contact message holds the recipient and the subject, nothing else. */
describe('le lien « Répondre par email »', () => {
	test('le destinataire et l’objet « Re : votre message à My Makeup », rien d’autre', () => {
		const link = replyMailto('lea@example.test')
		expect(REPLY_SUBJECT).toBe('Re : votre message à My Makeup')
		expect(link).toBe(`mailto:lea@example.test?subject=${encodeURIComponent(REPLY_SUBJECT)}`)
		expect(new URL(link ?? '').searchParams.get('subject')).toBe(REPLY_SUBJECT)
		expect([...new URL(link ?? '').searchParams.keys()]).toEqual(['subject'])
	})

	test.each([
		'a@b.fr?bcc=x@y.fr',
		'a@b.fr&cc=x@y.fr',
		'a@b.fr,x@y.fr',
		'a@b.fr;x@y.fr',
		'a b@c.fr',
		'a@b.fr\r\nBcc: x@y.fr',
		'pas-une-adresse',
		'',
	])('« %s » : pas de lien', value => {
		expect(replyMailto(value)).toBeNull()
	})

	test('une valeur absente : pas de lien', () => {
		expect(replyMailto(undefined)).toBeNull()
		expect(replyMailto(null)).toBeNull()
	})
})

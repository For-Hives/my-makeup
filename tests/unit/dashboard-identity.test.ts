import { describe, expect, test } from 'bun:test'
import { errorsByField, IDENTITY_MAX, identitySchema, strictIdentitySchema } from '@/lib/dashboard/identity'
import { FAILURE_MESSAGE, payloadFailure } from '@/lib/dashboard/result'

/**
 * The rules of the identity form (ticket 119; plan 02 U25, U26, U32): bounds, French messages under
 * the field, the strict schema of the server, and the failures of Payload told in French.
 */

const VALID = { prenom: 'Léa', nom: 'Fictive', nomArtiste: '', specialite: '' }

describe('U26 : les bornes des noms, espaces retirés', () => {
	test('un prénom et un nom de 2 à 70 caractères passent, rognés', () => {
		const wasRead = identitySchema.parse({ ...VALID, prenom: '  Lé  ', nom: 'x'.repeat(IDENTITY_MAX) })
		expect(wasRead.prenom).toBe('Lé')
		expect(wasRead.nom).toHaveLength(IDENTITY_MAX)
	})

	test('un nom d’un caractère, de 71 caractères ou fait d’espaces est refusé', () => {
		expect(identitySchema.safeParse({ ...VALID, nom: 'A' }).success).toBe(false)
		expect(identitySchema.safeParse({ ...VALID, nom: 'x'.repeat(IDENTITY_MAX + 1) }).success).toBe(false)
		expect(identitySchema.safeParse({ ...VALID, prenom: '     ' }).success).toBe(false)
	})

	test('le nom d’artiste et la spécialité peuvent rester vides, 70 caractères au plus', () => {
		expect(identitySchema.safeParse(VALID).success).toBe(true)
		expect(identitySchema.safeParse({ ...VALID, specialite: 'x'.repeat(IDENTITY_MAX + 1) }).success).toBe(false)
		expect(identitySchema.safeParse({ ...VALID, nomArtiste: 'x'.repeat(IDENTITY_MAX + 1) }).success).toBe(false)
	})
})

describe('U25 : un message en français par champ', () => {
	test('chaque champ refusé a son message, jamais en anglais', () => {
		const wasRead = identitySchema.safeParse({
			prenom: '',
			nom: 'A',
			nomArtiste: 'x'.repeat(71),
			specialite: 'y'.repeat(71),
		})
		if (wasRead.success) throw new Error('doit être refusé')
		expect(errorsByField(wasRead.error)).toEqual({
			prenom: 'Indique ton prénom.',
			nom: 'Ton nom doit contenir au moins 2 caractères.',
			nomArtiste: 'Ton nom d’artiste ne doit pas dépasser 70 caractères.',
			specialite: 'Ta spécialité ne doit pas dépasser 70 caractères.',
		})
	})

	test('une valeur qui n’est pas un texte (requête forgée) a un message français aussi', () => {
		const wasRead = strictIdentitySchema.safeParse({ ...VALID, prenom: 42, specialite: { a: 1 } })
		if (wasRead.success) throw new Error('doit être refusé')
		const messages = Object.values(errorsByField(wasRead.error))
		expect(messages).toHaveLength(2)
		for (const message of messages) expect(message).not.toMatch(/expected|invalid|string/i)
	})
})

describe('U32 : le schéma du serveur est strict', () => {
	test.each([
		'status',
		'verified',
		'score',
		'pro',
		'slug',
		'id',
		'superArtist',
		'chosenStatus',
	])('la clé réservée %s refuse la requête entière', cle => {
		expect(strictIdentitySchema.safeParse({ ...VALID, [cle]: 'x' }).success).toBe(false)
	})

	test('les quatre champs seuls passent', () => {
		expect(strictIdentitySchema.parse(VALID)).toEqual(VALID)
	})
})

describe('les échecs de Payload se disent en français', () => {
	const FIELDS = ['prenom', 'nom', 'nomArtiste', 'specialite'] as const

	test('le message d’un champ vient de data.errors', () => {
		const error = Object.assign(new Error('The following field is invalid: Prénom'), {
			data: { errors: [{ path: 'prenom', message: 'Ce champ est trop long.' }] },
		})
		const failure = payloadFailure(error, FIELDS)
		expect(failure.champs).toEqual({ prenom: 'Ce champ est trop long.' })
		expect(failure.message).not.toContain('The following')
	})

	test('sans message de champ, le message est celui du site, jamais error.message', () => {
		for (const error of [new Error('Connection terminated'), 'oups', null, { data: { errors: [{ path: 'pro' }] } }]) {
			expect(payloadFailure(error, FIELDS)).toEqual({ ok: false, message: FAILURE_MESSAGE })
		}
	})

	test('un chemin qui n’est pas un champ du formulaire est ignoré', () => {
		const error = { data: { errors: [{ path: 'pro', message: 'Interdit.' }] } }
		expect(payloadFailure(error, FIELDS).champs).toBeUndefined()
	})
})

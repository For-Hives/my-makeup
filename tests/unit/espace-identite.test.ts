import { describe, expect, test } from 'bun:test'
import { erreursParChamp, IDENTITE_MAX, schemaDeLIdentite, schemaDeLIdentiteStrict } from '@/lib/espace/identite'
import { echecDePayload, MESSAGE_ECHEC } from '@/lib/espace/resultat'

/**
 * The rules of the identity form (ticket 119; plan 02 U25, U26, U32): bounds, French messages under
 * the field, the strict schema of the server, and the failures of Payload told in French.
 */

const VALIDE = { prenom: 'Léa', nom: 'Fictive', nomArtiste: '', specialite: '' }

describe('U26 : les bornes des noms, espaces retirés', () => {
	test('un prénom et un nom de 2 à 70 caractères passent, rognés', () => {
		const lu = schemaDeLIdentite.parse({ ...VALIDE, prenom: '  Lé  ', nom: 'x'.repeat(IDENTITE_MAX) })
		expect(lu.prenom).toBe('Lé')
		expect(lu.nom).toHaveLength(IDENTITE_MAX)
	})

	test('un nom d’un caractère, de 71 caractères ou fait d’espaces est refusé', () => {
		expect(schemaDeLIdentite.safeParse({ ...VALIDE, nom: 'A' }).success).toBe(false)
		expect(schemaDeLIdentite.safeParse({ ...VALIDE, nom: 'x'.repeat(IDENTITE_MAX + 1) }).success).toBe(false)
		expect(schemaDeLIdentite.safeParse({ ...VALIDE, prenom: '     ' }).success).toBe(false)
	})

	test('le nom d’artiste et la spécialité peuvent rester vides, 70 caractères au plus', () => {
		expect(schemaDeLIdentite.safeParse(VALIDE).success).toBe(true)
		expect(schemaDeLIdentite.safeParse({ ...VALIDE, specialite: 'x'.repeat(IDENTITE_MAX + 1) }).success).toBe(false)
		expect(schemaDeLIdentite.safeParse({ ...VALIDE, nomArtiste: 'x'.repeat(IDENTITE_MAX + 1) }).success).toBe(false)
	})
})

describe('U25 : un message en français par champ', () => {
	test('chaque champ refusé a son message, jamais en anglais', () => {
		const lu = schemaDeLIdentite.safeParse({
			prenom: '',
			nom: 'A',
			nomArtiste: 'x'.repeat(71),
			specialite: 'y'.repeat(71),
		})
		if (lu.success) throw new Error('doit être refusé')
		expect(erreursParChamp(lu.error)).toEqual({
			prenom: 'Indique ton prénom.',
			nom: 'Ton nom doit contenir au moins 2 caractères.',
			nomArtiste: 'Ton nom d’artiste ne doit pas dépasser 70 caractères.',
			specialite: 'Ta spécialité ne doit pas dépasser 70 caractères.',
		})
	})

	test('une valeur qui n’est pas un texte (requête forgée) a un message français aussi', () => {
		const lu = schemaDeLIdentiteStrict.safeParse({ ...VALIDE, prenom: 42, specialite: { a: 1 } })
		if (lu.success) throw new Error('doit être refusé')
		const messages = Object.values(erreursParChamp(lu.error))
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
		expect(schemaDeLIdentiteStrict.safeParse({ ...VALIDE, [cle]: 'x' }).success).toBe(false)
	})

	test('les quatre champs seuls passent', () => {
		expect(schemaDeLIdentiteStrict.parse(VALIDE)).toEqual(VALIDE)
	})
})

describe('les échecs de Payload se disent en français', () => {
	const CHAMPS = ['prenom', 'nom', 'nomArtiste', 'specialite'] as const

	test('le message d’un champ vient de data.errors', () => {
		const erreur = Object.assign(new Error('The following field is invalid: Prénom'), {
			data: { errors: [{ path: 'prenom', message: 'Ce champ est trop long.' }] },
		})
		const echec = echecDePayload(erreur, CHAMPS)
		expect(echec.champs).toEqual({ prenom: 'Ce champ est trop long.' })
		expect(echec.message).not.toContain('The following')
	})

	test('sans message de champ, le message est celui du site, jamais error.message', () => {
		for (const erreur of [new Error('Connection terminated'), 'oups', null, { data: { errors: [{ path: 'pro' }] } }]) {
			expect(echecDePayload(erreur, CHAMPS)).toEqual({ ok: false, message: MESSAGE_ECHEC })
		}
	})

	test('un chemin qui n’est pas un champ du formulaire est ignoré', () => {
		const erreur = { data: { errors: [{ path: 'pro', message: 'Interdit.' }] } }
		expect(echecDePayload(erreur, CHAMPS).champs).toBeUndefined()
	})
})

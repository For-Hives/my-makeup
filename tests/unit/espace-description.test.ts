import { describe, expect, test } from 'bun:test'
import {
	DESCRIPTION_MAX,
	DESCRIPTION_MIN,
	descriptionCounter,
	descriptionErrors,
	descriptionSchema,
	removeHtml,
	strictDescriptionSchema,
} from '@/lib/dashboard/description'
import { longueurDescription } from '@/lib/profile/completude'

/** The rules of the description form (ticket 122; plan 02 U05, U27, U32). */

describe('U27 : 2 000 caractères au plus', () => {
	test('2 000 passent, 2 001 sont refusés avec un message en français', () => {
		expect(descriptionSchema.safeParse({ description: 'a'.repeat(DESCRIPTION_MAX) }).success).toBe(true)
		const lu = descriptionSchema.safeParse({ description: 'a'.repeat(DESCRIPTION_MAX + 1) })
		if (lu.success) throw new Error('doit être refusé')
		expect(descriptionErrors(lu.error)).toEqual({
			description: 'Ta description ne doit pas dépasser 2000 caractères.',
		})
	})

	test('la borne se compte sur le texte rangé : espaces des bords et HTML ne comptent pas', () => {
		const lu = descriptionSchema.parse({ description: `  <p>${'a'.repeat(DESCRIPTION_MAX)}</p>  ` })
		expect(lu.description).toHaveLength(DESCRIPTION_MAX)
	})

	test('une description vide est permise : elle efface le texte', () => {
		expect(descriptionSchema.parse({ description: '   ' })).toEqual({ description: '' })
	})

	test('une valeur qui n’est pas un texte a un message français', () => {
		const lu = strictDescriptionSchema.safeParse({ description: 42 })
		if (lu.success) throw new Error('doit être refusé')
		expect(descriptionErrors(lu.error).description).toBe('Ta description doit être un texte.')
	})
})

describe('U27 : le HTML collé est retiré', () => {
	test.each([
		['<b>Bonjour</b> à toutes', 'Bonjour à toutes'],
		['<p class="x" onclick="alert(1)">Texte</p>', 'Texte'],
		['Avant<script>alert(1)</script>Après', 'AvantAprès'],
		['<style>p{color:red}</style>Texte', 'Texte'],
		['<!-- note -->Texte', 'Texte'],
		['<<b>script>alert(1)<</b>/script>', ''],
		['<img src=x onerror=alert(1)>Texte', 'Texte'],
		['<SCRIPT>x</SCRIPT>Texte', 'Texte'],
	])('%j devient %j', (entree, sortie) => {
		expect(removeHtml(entree)).toBe(sortie)
		expect(removeHtml(entree)).not.toMatch(/<\/?[a-z]/i)
	})

	test('un « < » qui n’ouvre pas de balise reste du texte', () => {
		expect(removeHtml('Je prends 3 < 5 clientes par jour')).toBe('Je prends 3 < 5 clientes par jour')
	})

	test('les sauts de ligne sont gardés, \\r\\n devient \\n', () => {
		expect(removeHtml('Ligne 1\r\n\r\nLigne 2\nLigne 3')).toBe('Ligne 1\n\nLigne 2\nLigne 3')
		expect(removeHtml('<p>Un</p>\n<p>Deux</p>')).toBe('Un\nDeux')
	})
})

describe('U05 : le compteur suit la définition unique de la complétude', () => {
	test('199 caractères ne suffisent pas, 200 suffisent', () => {
		expect(descriptionCounter('a'.repeat(DESCRIPTION_MIN - 1))).toMatchObject({ compte: 199, assez: false })
		expect(descriptionCounter('a'.repeat(DESCRIPTION_MIN))).toMatchObject({ compte: 200, assez: true })
	})

	test('espaces des bords ignorés, suite d’espaces et de sauts de ligne comptée pour un', () => {
		const texte = `  ${'a'.repeat(100)} \n\n   ${'b'.repeat(99)}  `
		expect(descriptionCounter(texte).compte).toBe(200)
		expect(descriptionCounter(`${texte}c`).assez).toBe(true)
		expect(descriptionCounter(texte.slice(0, -3)).assez).toBe(false)
	})

	test('le HTML ne compte pas', () => {
		expect(descriptionCounter(`<b>${'a'.repeat(190)}</b><i></i>`)).toMatchObject({ compte: 190, assez: false })
	})

	test('le compte est celui de longueurDescription, pour des textes de toute forme', () => {
		for (const texte of ['', ' ', 'a b  c', 'a\n\nb\tc', 'é'.repeat(250), `x${' '.repeat(50)}y`])
			expect(descriptionCounter(texte).compte).toBe(longueurDescription(texte))
	})
})

describe('U32 : le schéma du serveur est strict', () => {
	test.each(['statut', 'verifie', 'score', 'pro', 'slug', 'id', 'prenom'])('la clé %s refuse la requête', cle => {
		expect(strictDescriptionSchema.safeParse({ description: 'x', [cle]: 'x' }).success).toBe(false)
	})
	test('le champ seul passe', () => {
		expect(strictDescriptionSchema.parse({ description: ' Bonjour ' })).toEqual({ description: 'Bonjour' })
	})
})

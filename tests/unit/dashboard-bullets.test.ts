import { describe, expect, test } from 'bun:test'
import {
	alreadyInList,
	BULLET_LENGTH,
	BULLETS_COUNT_MAX,
	LANGUAGES,
	listBullets,
	nameRefusal,
	readBullets,
	readNames,
	SKILLS,
} from '@/lib/dashboard/bullets'

/**
 * The rules of the chips of her space (tickets 127 and 128; plan 02 E30): a name, its bound, the
 * duplicate, the « ; », and the request the server reads. Pure functions, no window.
 */

const A = { id: 'a1', nom: 'Anglais' }

describe('127, 128 : un nom de puce', () => {
	test('E30 : 70 caractères passent, 71 sont refusés avec le message de la liste', () => {
		expect(nameRefusal('é'.repeat(BULLET_LENGTH), LANGUAGES)).toBeNull()
		expect(nameRefusal('é'.repeat(BULLET_LENGTH + 1), LANGUAGES)).toBe('Une langue ne doit pas dépasser 70 caractères.')
		expect(nameRefusal('x'.repeat(BULLET_LENGTH + 1), SKILLS)).toBe(
			'Une compétence ne doit pas dépasser 70 caractères.'
		)
	})

	test('un nom vide ou fait d’espaces est refusé, les espaces autour ne comptent pas dans la borne', () => {
		expect(nameRefusal('', LANGUAGES)).toBe('Écris une langue avant de l’ajouter.')
		expect(nameRefusal('   ', SKILLS)).toBe('Écris une compétence avant de l’ajouter.')
		expect(nameRefusal(`  ${'x'.repeat(BULLET_LENGTH)}  `, LANGUAGES)).toBeNull()
	})

	test('le doublon se reconnaît sans les espaces autour ni la casse', () => {
		expect(alreadyInList([A], ' anglais ')).toBe(true)
		expect(alreadyInList([A], 'ANGLAIS')).toBe(true)
		expect(alreadyInList([A], 'Espagnol')).toBe(false)
		expect(alreadyInList([A], '   ')).toBe(false)
	})
})

describe('127, 128 : ce que la saisie donne', () => {
	test('Entrée ou « Ajouter » : tout le texte est un nom, rogné', () => {
		expect(readNames('  Espagnol ', [A], LANGUAGES, true)).toEqual({ ok: true, noms: ['Espagnol'], reste: '' })
	})

	test('un « ; » termine un nom : ce qui le suit reste dans le champ', () => {
		expect(readNames('Espagnol; Italien;', [A], LANGUAGES, false)).toEqual({
			ok: true,
			noms: ['Espagnol', 'Italien'],
			reste: '',
		})
		expect(readNames('Espagnol; Ita', [A], LANGUAGES, false)).toEqual({ ok: true, noms: ['Espagnol'], reste: ' Ita' })
	})

	test('un « ; » seul, ou deux à la suite, ne disent rien et ne sont pas refusés', () => {
		expect(readNames(';', [], LANGUAGES, false)).toEqual({ ok: true, noms: [], reste: '' })
		expect(readNames('a;;b;', [], LANGUAGES, false)).toMatchObject({ ok: true, noms: ['a', 'b'] })
	})

	test('le premier nom refusé s’arrête avec le reste dans le champ, ceux d’avant sont ajoutés', () => {
		const wasRead = readNames('Italien;anglais;Russe;', [A], LANGUAGES, false)
		expect(wasRead).toEqual({ ok: false, noms: ['Italien'], reste: 'anglais;Russe;', message: LANGUAGES.doublon })
	})

	test('deux fois le même nom dans une même saisie : le second est un doublon', () => {
		const wasRead = readNames('Russe;russe;', [], LANGUAGES, false)
		expect(wasRead).toMatchObject({ ok: false, noms: ['Russe'], message: LANGUAGES.doublon })
	})

	test('un nom trop long dans une saisie à « ; » est refusé comme seul', () => {
		const wasRead = readNames(`${'x'.repeat(71)};`, [], SKILLS, false)
		expect(wasRead).toMatchObject({ ok: false, noms: [], message: SKILLS.tropLong })
	})

	test('Entrée sur un champ vide dit qu’il faut un nom', () => {
		expect(readNames('  ', [], LANGUAGES, true)).toMatchObject({ ok: false, message: LANGUAGES.requis })
	})
})

describe('127, 128 : la demande que le serveur lit', () => {
	test('les puces dans l’ordre, noms rognés, identifiant gardé seulement quand il est donné', () => {
		expect(
			readBullets(LANGUAGES, { puces: [{ id: 'a1', nom: ' Anglais ' }, { nom: 'Russe' }, { id: '', nom: 'Thaï' }] })
		).toEqual({
			ok: true,
			puces: [{ id: 'a1', nom: 'Anglais' }, { nom: 'Russe' }, { nom: 'Thaï' }],
		})
	})

	test('une liste vide est une liste', () => {
		expect(readBullets(LANGUAGES, { puces: [] })).toEqual({ ok: true, puces: [] })
	})

	test('E30 : un nom trop long refuse toute la demande, en français', () => {
		expect(readBullets(SKILLS, { puces: [{ nom: 'Teint' }, { nom: 'x'.repeat(71) }] })).toEqual({
			ok: false,
			message: SKILLS.tropLong,
		})
	})

	test('une clé en trop, un nom qui n’est pas un texte, trop de puces : refus entier', () => {
		for (const input of [
			{ puces: [{ nom: 'a' }], pro: 12 },
			{ puces: [{ nom: 'a', description: 'x' }] },
			{ puces: [{ nom: 12 }] },
			{ puces: 'Anglais' },
			{ puces: Array.from({ length: BULLETS_COUNT_MAX + 1 }, (_, rang) => ({ nom: `n${rang}` })) },
			null,
		]) {
			expect(readBullets(LANGUAGES, input)).toEqual({ ok: false, message: LANGUAGES.invalide })
		}
	})
})

describe('127, 128 : les puces d’une liste stockée', () => {
	test('une ligne sans nom ou sans identifiant ne fait pas de puce', () => {
		expect(
			listBullets([
				{ id: 'a', name: 'Anglais' },
				{ id: 'b', name: '  ' },
				{ id: 'c' },
				{ name: 'Sans id' },
				{ id: 'd', name: null },
			])
		).toEqual([{ id: 'a', nom: 'Anglais' }])
		expect(listBullets(null)).toEqual([])
	})

	test('deux puces de même nom gardent chacune la leur', () => {
		expect(
			listBullets([
				{ id: 'a', name: 'Anglais' },
				{ id: 'b', name: 'Anglais' },
			])
		).toEqual([
			{ id: 'a', nom: 'Anglais' },
			{ id: 'b', nom: 'Anglais' },
		])
	})
})

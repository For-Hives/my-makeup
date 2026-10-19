import { describe, expect, test } from 'bun:test'
import {
	COMPETENCES,
	dejaDansLaListe,
	LANGUES,
	LONGUEUR_PUCE,
	lireLesNoms,
	lireLesPuces,
	NOMBRE_MAX_DE_PUCES,
	pucesDeLaListe,
	refusDuNom,
} from '@/lib/dashboard/puces'

/**
 * The rules of the chips of her space (tickets 127 and 128; plan 02 E30): a name, its bound, the
 * duplicate, the « ; », and the request the server reads. Pure functions, no window.
 */

const A = { id: 'a1', nom: 'Anglais' }

describe('127, 128 : un nom de puce', () => {
	test('E30 : 70 caractères passent, 71 sont refusés avec le message de la liste', () => {
		expect(refusDuNom('é'.repeat(LONGUEUR_PUCE), LANGUES)).toBeNull()
		expect(refusDuNom('é'.repeat(LONGUEUR_PUCE + 1), LANGUES)).toBe('Une langue ne doit pas dépasser 70 caractères.')
		expect(refusDuNom('x'.repeat(LONGUEUR_PUCE + 1), COMPETENCES)).toBe(
			'Une compétence ne doit pas dépasser 70 caractères.'
		)
	})

	test('un nom vide ou fait d’espaces est refusé, les espaces autour ne comptent pas dans la borne', () => {
		expect(refusDuNom('', LANGUES)).toBe('Écris une langue avant de l’ajouter.')
		expect(refusDuNom('   ', COMPETENCES)).toBe('Écris une compétence avant de l’ajouter.')
		expect(refusDuNom(`  ${'x'.repeat(LONGUEUR_PUCE)}  `, LANGUES)).toBeNull()
	})

	test('le doublon se reconnaît sans les espaces autour ni la casse', () => {
		expect(dejaDansLaListe([A], ' anglais ')).toBe(true)
		expect(dejaDansLaListe([A], 'ANGLAIS')).toBe(true)
		expect(dejaDansLaListe([A], 'Espagnol')).toBe(false)
		expect(dejaDansLaListe([A], '   ')).toBe(false)
	})
})

describe('127, 128 : ce que la saisie donne', () => {
	test('Entrée ou « Ajouter » : tout le texte est un nom, rogné', () => {
		expect(lireLesNoms('  Espagnol ', [A], LANGUES, true)).toEqual({ ok: true, noms: ['Espagnol'], reste: '' })
	})

	test('un « ; » termine un nom : ce qui le suit reste dans le champ', () => {
		expect(lireLesNoms('Espagnol; Italien;', [A], LANGUES, false)).toEqual({
			ok: true,
			noms: ['Espagnol', 'Italien'],
			reste: '',
		})
		expect(lireLesNoms('Espagnol; Ita', [A], LANGUES, false)).toEqual({ ok: true, noms: ['Espagnol'], reste: ' Ita' })
	})

	test('un « ; » seul, ou deux à la suite, ne disent rien et ne sont pas refusés', () => {
		expect(lireLesNoms(';', [], LANGUES, false)).toEqual({ ok: true, noms: [], reste: '' })
		expect(lireLesNoms('a;;b;', [], LANGUES, false)).toMatchObject({ ok: true, noms: ['a', 'b'] })
	})

	test('le premier nom refusé s’arrête avec le reste dans le champ, ceux d’avant sont ajoutés', () => {
		const lu = lireLesNoms('Italien;anglais;Russe;', [A], LANGUES, false)
		expect(lu).toEqual({ ok: false, noms: ['Italien'], reste: 'anglais;Russe;', message: LANGUES.doublon })
	})

	test('deux fois le même nom dans une même saisie : le second est un doublon', () => {
		const lu = lireLesNoms('Russe;russe;', [], LANGUES, false)
		expect(lu).toMatchObject({ ok: false, noms: ['Russe'], message: LANGUES.doublon })
	})

	test('un nom trop long dans une saisie à « ; » est refusé comme seul', () => {
		const lu = lireLesNoms(`${'x'.repeat(71)};`, [], COMPETENCES, false)
		expect(lu).toMatchObject({ ok: false, noms: [], message: COMPETENCES.tropLong })
	})

	test('Entrée sur un champ vide dit qu’il faut un nom', () => {
		expect(lireLesNoms('  ', [], LANGUES, true)).toMatchObject({ ok: false, message: LANGUES.requis })
	})
})

describe('127, 128 : la demande que le serveur lit', () => {
	test('les puces dans l’ordre, noms rognés, identifiant gardé seulement quand il est donné', () => {
		expect(
			lireLesPuces(LANGUES, { puces: [{ id: 'a1', nom: ' Anglais ' }, { nom: 'Russe' }, { id: '', nom: 'Thaï' }] })
		).toEqual({
			ok: true,
			puces: [{ id: 'a1', nom: 'Anglais' }, { nom: 'Russe' }, { nom: 'Thaï' }],
		})
	})

	test('une liste vide est une liste', () => {
		expect(lireLesPuces(LANGUES, { puces: [] })).toEqual({ ok: true, puces: [] })
	})

	test('E30 : un nom trop long refuse toute la demande, en français', () => {
		expect(lireLesPuces(COMPETENCES, { puces: [{ nom: 'Teint' }, { nom: 'x'.repeat(71) }] })).toEqual({
			ok: false,
			message: COMPETENCES.tropLong,
		})
	})

	test('une clé en trop, un nom qui n’est pas un texte, trop de puces : refus entier', () => {
		for (const saisie of [
			{ puces: [{ nom: 'a' }], pro: 12 },
			{ puces: [{ nom: 'a', description: 'x' }] },
			{ puces: [{ nom: 12 }] },
			{ puces: 'Anglais' },
			{ puces: Array.from({ length: NOMBRE_MAX_DE_PUCES + 1 }, (_, rang) => ({ nom: `n${rang}` })) },
			null,
		]) {
			expect(lireLesPuces(LANGUES, saisie)).toEqual({ ok: false, message: LANGUES.invalide })
		}
	})
})

describe('127, 128 : les puces d’une liste stockée', () => {
	test('une ligne sans nom ou sans identifiant ne fait pas de puce', () => {
		expect(
			pucesDeLaListe([
				{ id: 'a', name: 'Anglais' },
				{ id: 'b', name: '  ' },
				{ id: 'c' },
				{ name: 'Sans id' },
				{ id: 'd', name: null },
			])
		).toEqual([{ id: 'a', nom: 'Anglais' }])
		expect(pucesDeLaListe(null)).toEqual([])
	})

	test('deux puces de même nom gardent chacune la leur', () => {
		expect(
			pucesDeLaListe([
				{ id: 'a', name: 'Anglais' },
				{ id: 'b', name: 'Anglais' },
			])
		).toEqual([
			{ id: 'a', nom: 'Anglais' },
			{ id: 'b', nom: 'Anglais' },
		])
	})
})

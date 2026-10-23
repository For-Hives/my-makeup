import { describe, expect, test } from 'bun:test'
import {
	ANTI_LOOP_DELAY_MS,
	canRedirect,
	type DraftStorage,
	forgetInput,
	guardInput,
	INPUT_LIFETIME_MS,
	readInput,
} from '@/lib/dashboard/guarded-input'

/** The typing kept while the session ends (ticket 121): kept, read back, forgotten, never trusted blindly. */

const FIELDS = ['prenom', 'nom'] as const
const NOW = 1_800_000_000_000

function falselyStorage(): DraftStorage & { contenu: Map<string, string> } {
	const content = new Map<string, string>()
	return {
		contenu: content,
		getItem: cle => content.get(cle) ?? null,
		setItem: (cle, valeur) => void content.set(cle, valeur),
		removeItem: cle => void content.delete(cle),
	}
}

describe('la saisie gardée', () => {
	test('gardée puis relue telle quelle, pour ce compte seulement', () => {
		const storage = falselyStorage()
		const input = { valeurs: { prenom: 'Inès', nom: 'Fictive' }, le: NOW, redirigeLe: NOW }
		expect(guardInput(storage, 'identite', '7', input)).toBe(true)

		expect(readInput(storage, 'identite', '7', FIELDS, NOW + 1000)).toEqual(input)
		expect(readInput(storage, 'identite', '8', FIELDS, NOW + 1000)).toBeNull()
	})

	test('oubliée : plus rien', () => {
		const storage = falselyStorage()
		guardInput(storage, 'identite', '7', { valeurs: { prenom: 'a', nom: 'b' }, le: NOW, redirigeLe: null })
		forgetInput(storage, 'identite', '7')
		expect(storage.contenu.size).toBe(0)
		expect(readInput(storage, 'identite', '7', FIELDS, NOW)).toBeNull()
	})

	test('trop ancienne : ignorée et effacée', () => {
		const storage = falselyStorage()
		guardInput(storage, 'identite', '7', { valeurs: { prenom: 'a', nom: 'b' }, le: NOW, redirigeLe: null })
		expect(readInput(storage, 'identite', '7', FIELDS, NOW + INPUT_LIFETIME_MS + 1)).toBeNull()
		expect(storage.contenu.size).toBe(0)
	})

	test('illisible, incomplète ou mal typée : ignorée', () => {
		const storage = falselyStorage()
		const key = 'mm:saisie:identite:7'
		for (const raw of [
			'pas du json',
			'null',
			'42',
			JSON.stringify({ le: NOW }),
			JSON.stringify({ le: NOW, valeurs: { prenom: 'a' } }),
			JSON.stringify({ le: NOW, valeurs: { prenom: 'a', nom: 3 } }),
			JSON.stringify({ le: 'hier', valeurs: { prenom: 'a', nom: 'b' } }),
		]) {
			storage.contenu.set(key, raw)
			expect(readInput(storage, 'identite', '7', FIELDS, NOW)).toBeNull()
		}
	})

	test('un navigateur qui refuse le stockage : rien ne casse, rien n’est gardé', () => {
		const refuse: DraftStorage = {
			getItem: () => {
				throw new Error('bloqué')
			},
			setItem: () => {
				throw new Error('bloqué')
			},
			removeItem: () => {
				throw new Error('bloqué')
			},
		}
		const input = { valeurs: { prenom: 'a', nom: 'b' }, le: NOW, redirigeLe: null }
		expect(guardInput(refuse, 'identite', '7', input)).toBe(false)
		expect(readInput(refuse, 'identite', '7', FIELDS, NOW)).toBeNull()
		expect(() => forgetInput(refuse, 'identite', '7')).not.toThrow()
		expect(guardInput(null, 'identite', '7', input)).toBe(false)
		expect(readInput(null, 'identite', '7', FIELDS, NOW)).toBeNull()
	})
})

describe('une seule redirection', () => {
	test('la première fois : oui ; juste après un renvoi : non ; bien plus tard : oui', () => {
		expect(canRedirect(null, NOW)).toBe(true)
		const without = { valeurs: {}, le: NOW, redirigeLe: null }
		expect(canRedirect(without, NOW)).toBe(true)
		const resent = { valeurs: {}, le: NOW, redirigeLe: NOW }
		expect(canRedirect(resent, NOW + 30_000)).toBe(false)
		expect(canRedirect(resent, NOW + ANTI_LOOP_DELAY_MS + 1)).toBe(true)
	})
})

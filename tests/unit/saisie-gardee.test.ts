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

const CHAMPS = ['prenom', 'nom'] as const
const MAINTENANT = 1_800_000_000_000

function faussementStockage(): DraftStorage & { contenu: Map<string, string> } {
	const contenu = new Map<string, string>()
	return {
		contenu,
		getItem: cle => contenu.get(cle) ?? null,
		setItem: (cle, valeur) => void contenu.set(cle, valeur),
		removeItem: cle => void contenu.delete(cle),
	}
}

describe('la saisie gardée', () => {
	test('gardée puis relue telle quelle, pour ce compte seulement', () => {
		const stockage = faussementStockage()
		const saisie = { valeurs: { prenom: 'Inès', nom: 'Fictive' }, le: MAINTENANT, redirigeLe: MAINTENANT }
		expect(guardInput(stockage, 'identite', '7', saisie)).toBe(true)

		expect(readInput(stockage, 'identite', '7', CHAMPS, MAINTENANT + 1000)).toEqual(saisie)
		expect(readInput(stockage, 'identite', '8', CHAMPS, MAINTENANT + 1000)).toBeNull()
	})

	test('oubliée : plus rien', () => {
		const stockage = faussementStockage()
		guardInput(stockage, 'identite', '7', { valeurs: { prenom: 'a', nom: 'b' }, le: MAINTENANT, redirigeLe: null })
		forgetInput(stockage, 'identite', '7')
		expect(stockage.contenu.size).toBe(0)
		expect(readInput(stockage, 'identite', '7', CHAMPS, MAINTENANT)).toBeNull()
	})

	test('trop ancienne : ignorée et effacée', () => {
		const stockage = faussementStockage()
		guardInput(stockage, 'identite', '7', { valeurs: { prenom: 'a', nom: 'b' }, le: MAINTENANT, redirigeLe: null })
		expect(readInput(stockage, 'identite', '7', CHAMPS, MAINTENANT + INPUT_LIFETIME_MS + 1)).toBeNull()
		expect(stockage.contenu.size).toBe(0)
	})

	test('illisible, incomplète ou mal typée : ignorée', () => {
		const stockage = faussementStockage()
		const cle = 'mm:saisie:identite:7'
		for (const brut of [
			'pas du json',
			'null',
			'42',
			JSON.stringify({ le: MAINTENANT }),
			JSON.stringify({ le: MAINTENANT, valeurs: { prenom: 'a' } }),
			JSON.stringify({ le: MAINTENANT, valeurs: { prenom: 'a', nom: 3 } }),
			JSON.stringify({ le: 'hier', valeurs: { prenom: 'a', nom: 'b' } }),
		]) {
			stockage.contenu.set(cle, brut)
			expect(readInput(stockage, 'identite', '7', CHAMPS, MAINTENANT)).toBeNull()
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
		const saisie = { valeurs: { prenom: 'a', nom: 'b' }, le: MAINTENANT, redirigeLe: null }
		expect(guardInput(refuse, 'identite', '7', saisie)).toBe(false)
		expect(readInput(refuse, 'identite', '7', CHAMPS, MAINTENANT)).toBeNull()
		expect(() => forgetInput(refuse, 'identite', '7')).not.toThrow()
		expect(guardInput(null, 'identite', '7', saisie)).toBe(false)
		expect(readInput(null, 'identite', '7', CHAMPS, MAINTENANT)).toBeNull()
	})
})

describe('une seule redirection', () => {
	test('la première fois : oui ; juste après un renvoi : non ; bien plus tard : oui', () => {
		expect(canRedirect(null, MAINTENANT)).toBe(true)
		const sans = { valeurs: {}, le: MAINTENANT, redirigeLe: null }
		expect(canRedirect(sans, MAINTENANT)).toBe(true)
		const renvoyee = { valeurs: {}, le: MAINTENANT, redirigeLe: MAINTENANT }
		expect(canRedirect(renvoyee, MAINTENANT + 30_000)).toBe(false)
		expect(canRedirect(renvoyee, MAINTENANT + ANTI_LOOP_DELAY_MS + 1)).toBe(true)
	})
})

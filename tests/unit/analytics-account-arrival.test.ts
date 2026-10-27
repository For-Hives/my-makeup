import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { type Browser, LAST_FUNNEL_KEY, shouldEmit } from '@/lib/analytics/duplicate'

/** `account_arrival` (27/10/2026): the arrival of a new account on her still-empty space, once per tab. */

function fakeBrowser(): Browser {
	const memory = new Map<string, string>()
	return {
		lire: cle => memory.get(cle) ?? null,
		ecrire: (cle, valeur) => void memory.set(cle, valeur),
		supprimer: cle => void memory.delete(cle),
		rechargement: () => false,
	}
}

describe('account_arrival : une fois par onglet, pas à chaque retour sur l’espace vide', () => {
	test('le premier passage part, le retour par la flèche et le rechargement ne repartent pas', () => {
		const browser = fakeBrowser()
		expect(shouldEmit('email_confirmed', '', 'rechargement', browser, LAST_FUNNEL_KEY)).toBe(true)
		expect(shouldEmit('account_arrival', '', 'meme-vue', browser, LAST_FUNNEL_KEY)).toBe(true)
		// She goes to her page in edit mode and comes back with the arrow: the profile is still empty.
		expect(shouldEmit('account_arrival', '', 'meme-vue', browser, LAST_FUNNEL_KEY)).toBe(false)
		expect(shouldEmit('account_arrival', '', 'meme-vue', browser, LAST_FUNNEL_KEY)).toBe(false)
	})

	test('le composant le demande en `meme-vue`, sans aucune propriété', () => {
		const source = readFileSync('src/components/analytics/AccountFunnel.tsx', 'utf8')
		expect(source).toContain("useOnce('account_arrival', 'meme-vue')")
		expect(source).not.toMatch(/track\('account_arrival',/)
	})
})

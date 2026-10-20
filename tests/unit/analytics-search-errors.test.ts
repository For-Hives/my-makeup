import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
	type Browser,
	FORM_SUBMISSION_KEY,
	fingerprint,
	formSubmission,
	noteSubmission,
	shouldEmit,
} from '@/lib/analytics/duplicate'
import { eventData } from '@/lib/analytics/events'
import { analyticsScript, installAnalytics } from '@/lib/analytics/loader'
import { profilePid } from '@/lib/analytics/pid'
import { errorCode, notFoundKind, resultBucket } from '@/lib/analytics/values'

/** Plan 04 §3.3, events 4, 5, 6, 8 and 21 (ticket 145): the values they send, and that nothing typed goes. */

function fakeBrowser(rechargement = false): Browser & { memoire: Map<string, string> } {
	const memory = new Map<string, string>()
	return {
		memoire: memory,
		lire: cle => memory.get(cle) ?? null,
		ecrire: (cle, valeur) => void memory.set(cle, valeur),
		supprimer: cle => void memory.delete(cle),
		rechargement: () => rechargement,
	}
}

describe('la tranche de résultats : jamais le nombre', () => {
	test.each([
		[0, '0'],
		[1, '1-5'],
		[5, '1-5'],
		[6, '6-20'],
		[20, '6-20'],
		[21, '21+'],
		[4000, '21+'],
	] as const)('%i résultats : %s', (nombre, tranche) => {
		expect(resultBucket(nombre)).toBe(tranche)
		expect(eventData('search_submit', { has_city: true, results: tranche, from: 'lien' })).not.toBeNull()
	})
})

describe('la 404 : une valeur de la liste fermée, jamais l’adresse', () => {
	test.each([
		['/profil/zoe-fictive', 'profil'],
		['/talent/maquillage-mariee', 'talent'],
		['/blog/article-inconnu/encore', 'blog'],
		['/Blog/x', 'blog'],
		['/', 'autre'],
		['/cette-page-n-existe-pas', 'autre'],
		['/profilx/zoe', 'autre'],
		['/search?search=lea@example.test', 'autre'],
	] as const)('%s : %s', (chemin, genre) => {
		expect(notFoundKind(chemin)).toBe(genre)
		expect(eventData('not_found', { kind: notFoundKind(chemin) })).toEqual({ kind: genre })
	})
})

describe('l’erreur : une portée et un code, jamais le message', () => {
	test('un script qui ne charge pas, une erreur de rendu, autre chose', () => {
		expect(errorCode(new Error('Loading chunk 123 failed'))).toBe('chunk_load')
		expect(errorCode(Object.assign(new Error('x'), { name: 'ChunkLoadError' }))).toBe('chunk_load')
		expect(errorCode(new Error('Cannot read properties of undefined (reading "nom")'))).toBe('render')
		expect(errorCode('texte')).toBe('unknown')
		expect(errorCode(null)).toBe('unknown')
	})

	test('le code d’une erreur dont le message est personnel reste dans la liste', () => {
		const code = errorCode(new Error('Échec pour lea@example.test 0612345678'))
		expect(eventData('app_error', { scope: 'site', code })).toEqual({ scope: 'site', code })
	})
})

describe('le profil d’un résultat', () => {
	test('l’id de l’ancien site s’il existe, sinon v3-<id>', () => {
		expect(profilePid({ id: 9, strapiId: 120 })).toBe(120)
		expect(profilePid({ id: 9, strapiId: null })).toBe('v3-9')
		expect(profilePid({ id: 9 })).toBe('v3-9')
		expect(profilePid({ id: 9, strapiId: 0 })).toBe('v3-9')
		expect(eventData('search_result_click', { rank: 21, pid: profilePid({ id: 9 }) })).toEqual({
			rank: 21,
			pid: 'v3-9',
		})
	})
})

describe('aucun doublon', () => {
	test('la 404 rechargée n’est pas comptée deux fois ; une autre adresse, ou une navigation, l’est', () => {
		const first = fakeBrowser()
		expect(shouldEmit('not_found', '/zzz', 'rechargement', first)).toBe(true)
		// Same tab, the browser reloaded the page.
		const reload = { ...first, rechargement: () => true }
		expect(shouldEmit('not_found', '/zzz', 'rechargement', reload)).toBe(false)
		expect(shouldEmit('not_found', '/zzz', 'rechargement', reload)).toBe(false)
		// Another dead address, then back to the first by a link (no reload): two more.
		expect(shouldEmit('not_found', '/autre', 'rechargement', reload)).toBe(true)
		expect(shouldEmit('not_found', '/zzz', 'rechargement', first)).toBe(true)
	})

	test('l’erreur : portée et événement comptent à part', () => {
		const browser = fakeBrowser(true)
		expect(shouldEmit('app_error', 'site::/x', 'rechargement', browser)).toBe(true)
		expect(shouldEmit('app_error', 'site::/x', 'rechargement', browser)).toBe(false)
		expect(shouldEmit('app_error', 'espace::/x', 'rechargement', browser)).toBe(true)
	})

	test('la même recherche vue de nouveau (page 2, retour) n’est pas une nouvelle soumission', () => {
		const browser = fakeBrowser()
		const view = fingerprint('mariée|Annecy')
		expect(shouldEmit('search_submit', view, 'meme-vue', browser)).toBe(true)
		expect(shouldEmit('search_submit', view, 'meme-vue', browser)).toBe(false)
		expect(shouldEmit('search_submit', fingerprint('soirée|Annecy'), 'meme-vue', browser)).toBe(true)
	})

	test('le formulaire soumis se lit une seule fois', () => {
		const browser = fakeBrowser()
		expect(formSubmission(browser)).toBe(false)
		noteSubmission(browser)
		expect(browser.memoire.get(FORM_SUBMISSION_KEY)).toBe('1')
		expect(formSubmission(browser)).toBe(true)
		expect(formSubmission(browser)).toBe(false)
	})

	test('l’empreinte ne laisse pas lire les mots', () => {
		expect(fingerprint('mariée|Annecy')).not.toContain('Annecy')
		expect(fingerprint('a')).not.toBe(fingerprint('b'))
		const browser = fakeBrowser()
		shouldEmit('search_submit', 'lea@example.test|Annecy', 'meme-vue', browser)
		expect([...browser.memoire.values()].join('')).not.toMatch(/lea|Annecy|@/)
	})
})

describe('rien de saisi ne part : lecture du code', () => {
	const read = (chemin: string) => readFileSync(new URL(`../../${chemin}`, import.meta.url), 'utf8')

	test('la page de recherche ne donne au navigateur que deux faits et une empreinte', () => {
		const page = read('src/app/(front)/(site)/search/page.tsx')
		const tag = page.match(/<SearchAnalytics[\s\S]*?\/>/)?.[0] ?? ''
		expect(tag).toContain("aUneVille={city !== ''}")
		expect(tag).toContain('resultBucket(all.length)')
		expect(tag).toContain('fingerprint(')
		expect(tag).not.toMatch(/search=\{search\}|city=\{city\}|recherche=/)
	})

	test('chaque page n’émet que par le chemin unique, et chaque événement du lot a son point d’émission', () => {
		const pages = read('src/components/analytics/PageAnalytics.tsx')
		for (const name of ['search_submit', 'not_found', 'app_error']) expect(pages).toContain(`track('${name}'`)
		const links = read('src/components/analytics/TrackedLink.tsx')
		for (const name of ['cta_click', 'search_result_click']) expect(links).toContain(`track('${name}'`)
		expect(read('src/components/blocks/Cta.tsx')).toContain("where: 'cta_recherche'")
		expect(read('src/components/blocks/Cta.tsx')).toContain("where: 'cta_inscription'")
		expect(read('src/components/layout/Nav.tsx')).toContain("nom: 'nav_recherche'")
		expect(read('src/components/search/ResultCard.tsx')).toContain("nom: 'search_result_click'")
		expect(read('src/app/(front)/(site)/not-found.tsx')).toContain('<NotFoundAnalytics />')
		expect(read('src/app/(front)/(site)/error.tsx')).toContain('scope="site"')
		expect(read('src/app/(front)/(dashboard)/auth/error.tsx')).toContain('scope="espace"')
		expect(read('src/app/global-error.tsx')).toContain('scope="global"')
	})
})

describe('le traceur des pages qui l’ont perdu (404 d’une adresse inconnue, page d’erreur)', () => {
	const jsdomWindow = (extra: Record<string, unknown> = {}) => {
		const added: { text: string }[] = []
		return {
			ajoutes: added,
			fenetre: {
				document: {
					head: { appendChild: (noeud: unknown) => added.push(noeud as { text: string }) },
					createElement: () => ({ text: '' }),
				},
				...extra,
			},
		}
	}

	test('il ajoute le script de l’en-tête, une fois, en production seulement', () => {
		const { fenetre: f, ajoutes: added } = jsdomWindow()
		expect(installAnalytics(f, false)).toBe(false)
		expect(added).toHaveLength(0)
		expect(installAnalytics(f, true)).toBe(true)
		expect(added[0]?.text).toBe(analyticsScript())
		expect(added[0]?.text).toContain('mmAttenteUmami')
		expect(added[0]?.text).toContain('/u/script.js')
	})

	test('il ne fait rien si le traceur ou sa salle d’attente est là, ou sans page', () => {
		const withRoom = jsdomWindow({ mmAttenteUmami: () => true })
		expect(installAnalytics(withRoom.fenetre, true)).toBe(false)
		const withUmami = jsdomWindow({ umami: { track: () => undefined } })
		expect(installAnalytics(withUmami.fenetre, true)).toBe(false)
		expect(installAnalytics(undefined, true)).toBe(false)
		expect(withRoom.ajoutes.length + withUmami.ajoutes.length).toBe(0)
	})
})

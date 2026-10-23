import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
	CATALOG,
	type EventName,
	eventData,
	type MyMakeupEvents,
	NAME_MAX,
	TEXT_MAX,
	webVitalProperties,
} from '@/lib/analytics/events'
import { createTrack, type Execution, type MeasuredWindow } from '@/lib/analytics/track'

/** One valid use of every event. A new event of the catalogue does not compile until it has its line. */
const EXAMPLES: { [N in EventName]: MyMakeupEvents[N] } = {
	contact_click: { pid: 12, channel: 'phone' },
	search_submit: { has_city: true, results: '6-20', from: 'formulaire' },
	search_result_click: { rank: 3, pid: 'v3-45' },
	cta_click: { where: 'nav_recherche_mobile' },
	platform_contact_submit: { ok: false, status: 500 },
	not_found: { kind: 'blog' },
	signup_start: { method: 'google' },
	login_result: { method: 'email', ok: false, code: 'identifiants-invalides' },
	auth_error: { code: 'compte-bloque' },
	session_expired: { where: 'jwt_expire' },
	profile_save: { section: 'offres', ok: true },
	profile_visibility: { public: true },
	upload_error: { kind: 'size' },
	profile_publiable: {},
	account_delete: {},
	onboarding_step: { step: 'compte_cree' },
	onboarding_source: { source: 'ia' },
	contact_reveal: { pid: 7, channel: 'phone' },
	app_error: { scope: 'site', code: 'render' },
	'web-vitals': { name: 'LCP', value: 1234, rating: 'good', page: '/profil/exemple' },
}

describe('U82 : chaque événement appartient au catalogue fermé et ne porte aucune donnée personnelle', () => {
	test('le catalogue est celui du plan, sans les événements du devis, avec les Web Vitals', () => {
		expect(Object.keys(CATALOG).sort()).toEqual(Object.keys(EXAMPLES).sort())
		// The 21 events of plan 04 §3.3, less the two of the quote form, plus the Web Vitals.
		expect(Object.keys(CATALOG)).toHaveLength(20)
		expect(Object.keys(CATALOG)).not.toContain('devis_click')
		expect(Object.keys(CATALOG)).not.toContain('demande_envoyee')
	})

	test('un nom en snake_case de 50 caractères au plus ; `web-vitals` garde son tiret, la série existe', () => {
		for (const nameValue of Object.keys(CATALOG)) {
			expect(nameValue.length).toBeLessThanOrEqual(NAME_MAX)
			expect(nameValue === 'web-vitals' || /^[a-z]+(_[a-z]+)*$/.test(nameValue), nameValue).toBe(true)
		}
	})

	test.each(Object.entries(EXAMPLES))('%s : un usage valide passe, à plat', (nom, proprietes) => {
		const data = eventData(nom, proprietes)
		expect(data).not.toBeNull()
		for (const value of Object.values(data ?? {})) expect(['string', 'number', 'boolean']).toContain(typeof value)
	})

	test('un nom inconnu, une propriété en trop, une propriété manquante : l’événement tombe tout entier', () => {
		expect(eventData('inconnu', {})).toBeNull()
		expect(eventData('devis_click', { pid: 1, from: 'profil' })).toBeNull()
		expect(eventData('toString', {})).toBeNull()
		expect(eventData('cta_click', { where: 'cta_recherche', en_trop: 1 })).toBeNull()
		expect(eventData('cta_click', {})).toBeNull()
		expect(eventData('profile_publiable', { ok: true })).toBeNull()
		expect(eventData('contact_click', null)).toBeNull()
		expect(eventData('contact_click', [])).toBeNull()
	})

	test('une valeur hors de sa liste fait tomber l’événement', () => {
		expect(eventData('contact_click', { pid: 12, channel: 'telegram' })).toBeNull()
		expect(eventData('search_submit', { has_city: 'oui', results: '6-20', from: 'lien' })).toBeNull()
		expect(eventData('search_submit', { has_city: true, results: '7-20', from: 'lien' })).toBeNull()
		expect(eventData('search_result_click', { rank: 0, pid: 1 })).toBeNull()
		expect(eventData('search_result_click', { rank: 1.5, pid: 1 })).toBeNull()
		expect(eventData('platform_contact_submit', { ok: true, status: 600 })).toBeNull()
		expect(eventData('login_result', { method: 'email', ok: true, code: 'un-code-inventé' })).toBeNull()
	})

	test('pid : un id de l’ancien site, ou v3-<id> ; rien d’autre', () => {
		expect(eventData('contact_click', { pid: 12, channel: 'email' })).toEqual({ pid: 12, channel: 'email' })
		// A numeric text is the same id: the series of the live site are numbers.
		expect(eventData('contact_click', { pid: '12', channel: 'email' })).toEqual({ pid: 12, channel: 'email' })
		expect(eventData('contact_click', { pid: 'v3-34', channel: 'email' })).toEqual({
			pid: 'v3-34',
			channel: 'email',
		})
		for (const pid of [
			0,
			-1,
			1.5,
			'',
			'abc',
			'v3-',
			'v3-0',
			'v3-abc',
			'V3-1',
			'12abc',
			12345678901,
			null,
			undefined,
			{},
		])
			expect(eventData('contact_click', { pid, channel: 'email' }), String(pid)).toBeNull()
	})

	test('aucune donnée personnelle : un texte qui ressemble à un email ou à un téléphone fait tomber l’événement', () => {
		for (const page of [
			'/profil/lea@example.test',
			'/profil/0612345678',
			'/profil/06 12 34 56 78',
			'/x/06.12.34.56.78',
		])
			expect(eventData('web-vitals', { name: 'LCP', value: 1, rating: 'good', page }), page).toBeNull()
	})

	test('une propriété ne peut pas porter un texte saisi : les listes sont fermées', () => {
		for (const [nameValue, specs] of Object.entries(CATALOG)) {
			for (const [key, spec] of Object.entries(specs)) {
				const example = EXAMPLES[nameValue as EventName] as Record<string, unknown>
				if (spec.type === 'enum')
					expect(
						eventData(nameValue, { ...example, [key]: 'texte saisi par une personne' }),
						`${nameValue}.${key}`
					).toBeNull()
			}
		}
	})

	test('les Web Vitals : le chemin perd son paramètre et son ancre, et se coupe à 99 caractères', () => {
		const long = `/${'a'.repeat(200)}`
		const data = eventData('web-vitals', {
			name: 'CLS',
			value: 0.123,
			rating: 'good',
			page: `${long}?q=x#y`,
		})
		expect(String(data?.page)).toHaveLength(TEXT_MAX)
		expect(eventData('web-vitals', { name: 'CLS', value: 1, rating: 'good', page: '/a?q=x#y' })?.page).toBe('/a')
		expect(eventData('web-vitals', { name: 'CLS', value: 1, rating: 'good', page: 'a' })).toBeNull()
		expect(eventData('web-vitals', { name: 'CLS', value: Number.NaN, rating: 'good', page: '/' })).toBeNull()
		expect(eventData('web-vitals', { name: 'CLS', value: -1, rating: 'good', page: '/' })).toBeNull()
		expect(eventData('web-vitals', { name: 'FID', value: 1, rating: 'good', page: '/' })).toBeNull()
	})
})

describe('Web Vitals : de la mesure de Next à l’événement', () => {
	test('CLS à trois décimales, les autres en millisecondes entières, la note de la mesure', () => {
		expect(webVitalProperties({ name: 'CLS', value: 0.123456, rating: 'good' }, '/')).toEqual({
			name: 'CLS',
			value: 0.123,
			rating: 'good',
			page: '/',
		})
		expect(webVitalProperties({ name: 'LCP', value: 2499.6, rating: 'poor' }, '/profil/x?y=1')).toEqual({
			name: 'LCP',
			value: 2500,
			rating: 'poor',
			page: '/profil/x',
		})
	})

	test('sans note, ou avec une note inconnue, elle vient des seuils de web.dev', () => {
		const note = (name: string, value: number, rating?: string) =>
			webVitalProperties({ name, value, rating }, '/')?.rating
		expect(note('LCP', 2500)).toBe('good')
		expect(note('LCP', 2501)).toBe('needs-improvement')
		expect(note('LCP', 4001, 'bizarre')).toBe('poor')
		expect(note('CLS', 0.1)).toBe('good')
		expect(note('INP', 501)).toBe('poor')
		expect(note('TTFB', 800)).toBe('good')
		expect(note('FCP', 3000)).toBe('needs-improvement')
	})

	test('une mesure que le site n’envoie pas, ou invalide, n’est rien', () => {
		expect(webVitalProperties({ name: 'FID', value: 1 }, '/')).toBeNull()
		expect(webVitalProperties({ name: 'Next.js-hydration', value: 1 }, '/')).toBeNull()
		expect(webVitalProperties({ name: 'LCP', value: Number.NaN }, '/')).toBeNull()
		expect(webVitalProperties({ name: 'LCP', value: -5 }, '/')).toBeNull()
		expect(webVitalProperties({ name: 'LCP', value: 5 }, 'pas-un-chemin')).toBeNull()
	})

	test('toute mesure qui passe est un événement valide du catalogue', () => {
		for (const name of ['CLS', 'FCP', 'INP', 'LCP', 'TTFB']) {
			const properties = webVitalProperties({ name, value: 10 }, '/profil/x')
			expect(properties).not.toBeNull()
			expect(eventData('web-vitals', properties)).not.toBeNull()
		}
	})
})

/** A browser that records what Umami is given. */
function browser(surcharge: Partial<MeasuredWindow> = {}) {
	const followedList: { nom: string; donnees: unknown }[] = []
	const jsdomWindow: MeasuredWindow = {
		navigator: { webdriver: false },
		umami: { track: (nom, donnees) => followedList.push({ nom, donnees }) },
		...surcharge,
	}
	return { fenetre: jsdomWindow, suivis: followedList }
}
const follow = (execution: Execution) => createTrack(() => execution)

describe('U83 : track() n’émet rien et ne lève rien sans Umami, en dev ou si navigator.webdriver', () => {
	test('en production, avec Umami : l’événement va à window.umami.track, vérifié et à plat', () => {
		const { fenetre: jsdomWindow, suivis: followedList } = browser()
		expect(follow({ fenetre: jsdomWindow, production: true })('contact_click', { pid: 12, channel: 'phone' })).toBe(
			true
		)
		expect(followedList).toEqual([{ nom: 'contact_click', donnees: { pid: 12, channel: 'phone' } }])
	})

	test('un événement sans propriété se suit sans argument', () => {
		const { fenetre: jsdomWindow, suivis: followedList } = browser()
		expect(follow({ fenetre: jsdomWindow, production: true })('profile_publiable')).toBe(true)
		expect(followedList).toEqual([{ nom: 'profile_publiable', donnees: {} }])
	})

	test('hors production (développement, tests) : rien', () => {
		const { fenetre: jsdomWindow, suivis: followedList } = browser()
		expect(follow({ fenetre: jsdomWindow, production: false })('cta_click', { where: 'cta_recherche' })).toBe(false)
		expect(followedList).toEqual([])
	})

	test('un navigateur automatisé : rien', () => {
		const { fenetre: jsdomWindow, suivis: followedList } = browser({ navigator: { webdriver: true } })
		expect(follow({ fenetre: jsdomWindow, production: true })('cta_click', { where: 'cta_recherche' })).toBe(false)
		expect(followedList).toEqual([])
	})

	test('sans Umami et sans salle d’attente (script bloqué, rendu sur le serveur) : rien, et pas d’erreur', () => {
		expect(
			follow({ fenetre: { navigator: { webdriver: false } }, production: true })('not_found', { kind: 'autre' })
		).toBe(false)
		expect(follow({ fenetre: undefined, production: true })('not_found', { kind: 'autre' })).toBe(false)
		expect(follow({ fenetre: { umami: {} }, production: true })('not_found', { kind: 'autre' })).toBe(false)
	})

	test('le script d’Umami charge encore : l’événement attend dans la salle, qui peut refuser', () => {
		const waiting: unknown[] = []
		const room = (nom: string, donnees: unknown) => {
			waiting.push({ nom, donnees })
			return true
		}
		expect(follow({ fenetre: { mmAttenteUmami: room }, production: true })('not_found', { kind: 'blog' })).toBe(true)
		expect(waiting).toEqual([{ nom: 'not_found', donnees: { kind: 'blog' } }])
		expect(follow({ fenetre: { mmAttenteUmami: () => false }, production: true })('not_found', { kind: 'blog' })).toBe(
			false
		)
	})

	test('un événement invalide n’est jamais remis à Umami, même s’il est typé de force', () => {
		const { fenetre: jsdomWindow, suivis: followedList } = browser()
		const force = follow({ fenetre: jsdomWindow, production: true }) as unknown as (
			nom: string,
			proprietes: unknown
		) => boolean
		expect(force('inconnu', {})).toBe(false)
		expect(force('cta_click', { where: 'cta_recherche', email: 'lea@example.test' })).toBe(false)
		expect(force('cta_click', { where: 'saisi' })).toBe(false)
		expect(followedList).toEqual([])
	})

	test('rien ne se lève : Umami qui échoue, une fenêtre qui lève à la lecture', () => {
		const broken = browser({
			umami: {
				track: () => {
					throw new Error('boum')
				},
			},
		})
		expect(follow({ fenetre: broken.fenetre, production: true })('not_found', { kind: 'blog' })).toBe(false)
		const trap = {
			get navigator(): never {
				throw new Error('boum')
			},
		} as MeasuredWindow
		expect(follow({ fenetre: trap, production: true })('not_found', { kind: 'blog' })).toBe(false)
	})
})

describe('un seul chemin vers Umami (test statique)', () => {
	const ROOT = path.resolve(import.meta.dir, '../..')
	/** The only code that knows Umami: the module of the measure, its relay and the environment. */
	const ALLOWED = new Set([
		'src/lib/analytics/events.ts',
		'src/lib/analytics/relay.ts',
		'src/lib/analytics/track.ts',
		'src/lib/analytics/umami.ts',
		'src/lib/env.ts',
		'src/app/u/api/send/route.ts',
		'src/app/u/script.js/route.ts',
		// The layout inserts the inline script of the module, and mounts the Web Vitals.
		'src/app/(front)/layout.tsx',
	])
	/** What reaches Umami from a page, or names its instance. */
	const CALL_DIRECT =
		/window\.umami|\bumami\.track|data-umami-event|mmAttenteUmami|mmAvantEnvoi|umami\.wadefade|fetch\(\s*['"`]\/u\//i

	function sources(dossier: string): string[] {
		return readdirSync(path.join(ROOT, dossier), { recursive: true, withFileTypes: true })
			.filter(entree => entree.isFile() && /\.(ts|tsx|js|jsx|mjs|css)$/.test(entree.name))
			.map(entree => path.relative(ROOT, path.join(entree.parentPath, entree.name)))
	}

	test('aucun appel à Umami dans les sources, hors du module de la mesure', () => {
		const faulty = [...sources('src'), 'next.config.ts']
			.filter(fichier => !ALLOWED.has(fichier))
			.filter(fichier => CALL_DIRECT.test(readFileSync(path.join(ROOT, fichier), 'utf8')))
		expect(faulty).toEqual([])
	})

	test('le test voit ce qu’il cherche : il trouve les appels du module', () => {
		const found = [...ALLOWED].filter(fichier => CALL_DIRECT.test(readFileSync(path.join(ROOT, fichier), 'utf8')))
		expect(found).toContain('src/lib/analytics/track.ts')
		expect(found).toContain('src/lib/analytics/umami.ts')
	})

	test('une page n’émet que par track() : aucun composant n’importe le module de bas niveau', () => {
		const importers = sources('src')
			.filter(fichier => !fichier.startsWith('src/lib/analytics/'))
			.filter(fichier =>
				/from ['"](@\/lib\/analytics\/(umami|relay)|\.\.?\/.*analytics\/(umami|relay))['"]/.test(
					readFileSync(path.join(ROOT, fichier), 'utf8')
				)
			)
		expect(importers.sort()).toEqual(
			['src/app/(front)/layout.tsx', 'src/app/u/api/send/route.ts', 'src/app/u/script.js/route.ts'].sort()
		)
	})
})

describe('à la compilation : un nom inconnu ou une propriété en trop ne passent pas', () => {
	// Never called: `bun run typecheck` reads these lines, and fails when one of the errors is missing.
	// biome-ignore lint/correctness/noUnusedVariables: read by the compiler only
	function compilation(): void {
		const followed = createTrack(() => ({ fenetre: undefined, production: false }))
		followed('contact_click', { pid: 1, channel: 'email' })
		followed('profile_publiable')
		followed('login_result', { method: 'google', ok: true, code: 'ok' })
		// @ts-expect-error unknown event name
		followed('inconnu', {})
		// @ts-expect-error the events of the quote form are not in the catalogue
		followed('devis_click', { pid: 1, from: 'profil' })
		// @ts-expect-error extra property
		followed('contact_click', { pid: 1, channel: 'email', nom: 'Léa' })
		// @ts-expect-error missing property
		followed('contact_click', { pid: 1 })
		// @ts-expect-error value out of its list
		followed('contact_click', { pid: 1, channel: 'telegram' })
		// @ts-expect-error wrong type of value
		followed('search_submit', { has_city: 'oui', results: '0', from: 'lien' })
		// @ts-expect-error an event without properties takes none
		followed('profile_publiable', { ok: true })
		// @ts-expect-error an event with properties needs them
		followed('cta_click')
		// @ts-expect-error a pid is a number or v3-<id>
		followed('contact_click', { pid: 'abc', channel: 'email' })
	}
	test('les lignes @ts-expect-error de ce bloc sont vérifiées par « bun run typecheck »', () => {
		expect(typeof compilation).toBe('function')
	})
})

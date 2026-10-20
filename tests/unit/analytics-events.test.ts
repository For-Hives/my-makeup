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
const EXEMPLES: { [N in EventName]: MyMakeupEvents[N] } = {
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
		expect(Object.keys(CATALOG).sort()).toEqual(Object.keys(EXEMPLES).sort())
		// The 21 events of plan 04 §3.3, less the two of the quote form, plus the Web Vitals.
		expect(Object.keys(CATALOG)).toHaveLength(20)
		expect(Object.keys(CATALOG)).not.toContain('devis_click')
		expect(Object.keys(CATALOG)).not.toContain('demande_envoyee')
	})

	test('un nom en snake_case de 50 caractères au plus ; `web-vitals` garde son tiret, la série existe', () => {
		for (const nom of Object.keys(CATALOG)) {
			expect(nom.length).toBeLessThanOrEqual(NAME_MAX)
			expect(nom === 'web-vitals' || /^[a-z]+(_[a-z]+)*$/.test(nom), nom).toBe(true)
		}
	})

	test.each(Object.entries(EXEMPLES))('%s : un usage valide passe, à plat', (nom, proprietes) => {
		const donnees = eventData(nom, proprietes)
		expect(donnees).not.toBeNull()
		for (const valeur of Object.values(donnees ?? {})) expect(['string', 'number', 'boolean']).toContain(typeof valeur)
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
		for (const [nom, specs] of Object.entries(CATALOG)) {
			for (const [cle, spec] of Object.entries(specs)) {
				const exemple = EXEMPLES[nom as EventName] as Record<string, unknown>
				if (spec.type === 'enum')
					expect(eventData(nom, { ...exemple, [cle]: 'texte saisi par une personne' }), `${nom}.${cle}`).toBeNull()
			}
		}
	})

	test('les Web Vitals : le chemin perd son paramètre et son ancre, et se coupe à 99 caractères', () => {
		const long = `/${'a'.repeat(200)}`
		const donnees = eventData('web-vitals', {
			name: 'CLS',
			value: 0.123,
			rating: 'good',
			page: `${long}?q=x#y`,
		})
		expect(String(donnees?.page)).toHaveLength(TEXT_MAX)
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
			const proprietes = webVitalProperties({ name, value: 10 }, '/profil/x')
			expect(proprietes).not.toBeNull()
			expect(eventData('web-vitals', proprietes)).not.toBeNull()
		}
	})
})

/** A browser that records what Umami is given. */
function navigateur(surcharge: Partial<MeasuredWindow> = {}) {
	const suivis: { nom: string; donnees: unknown }[] = []
	const fenetre: MeasuredWindow = {
		navigator: { webdriver: false },
		umami: { track: (nom, donnees) => suivis.push({ nom, donnees }) },
		...surcharge,
	}
	return { fenetre, suivis }
}
const suivre = (execution: Execution) => createTrack(() => execution)

describe('U83 : track() n’émet rien et ne lève rien sans Umami, en dev ou si navigator.webdriver', () => {
	test('en production, avec Umami : l’événement va à window.umami.track, vérifié et à plat', () => {
		const { fenetre, suivis } = navigateur()
		expect(suivre({ fenetre, production: true })('contact_click', { pid: 12, channel: 'phone' })).toBe(true)
		expect(suivis).toEqual([{ nom: 'contact_click', donnees: { pid: 12, channel: 'phone' } }])
	})

	test('un événement sans propriété se suit sans argument', () => {
		const { fenetre, suivis } = navigateur()
		expect(suivre({ fenetre, production: true })('profile_publiable')).toBe(true)
		expect(suivis).toEqual([{ nom: 'profile_publiable', donnees: {} }])
	})

	test('hors production (développement, tests) : rien', () => {
		const { fenetre, suivis } = navigateur()
		expect(suivre({ fenetre, production: false })('cta_click', { where: 'cta_recherche' })).toBe(false)
		expect(suivis).toEqual([])
	})

	test('un navigateur automatisé : rien', () => {
		const { fenetre, suivis } = navigateur({ navigator: { webdriver: true } })
		expect(suivre({ fenetre, production: true })('cta_click', { where: 'cta_recherche' })).toBe(false)
		expect(suivis).toEqual([])
	})

	test('sans Umami et sans salle d’attente (script bloqué, rendu sur le serveur) : rien, et pas d’erreur', () => {
		expect(
			suivre({ fenetre: { navigator: { webdriver: false } }, production: true })('not_found', { kind: 'autre' })
		).toBe(false)
		expect(suivre({ fenetre: undefined, production: true })('not_found', { kind: 'autre' })).toBe(false)
		expect(suivre({ fenetre: { umami: {} }, production: true })('not_found', { kind: 'autre' })).toBe(false)
	})

	test('le script d’Umami charge encore : l’événement attend dans la salle, qui peut refuser', () => {
		const attente: unknown[] = []
		const salle = (nom: string, donnees: unknown) => {
			attente.push({ nom, donnees })
			return true
		}
		expect(suivre({ fenetre: { mmAttenteUmami: salle }, production: true })('not_found', { kind: 'blog' })).toBe(true)
		expect(attente).toEqual([{ nom: 'not_found', donnees: { kind: 'blog' } }])
		expect(suivre({ fenetre: { mmAttenteUmami: () => false }, production: true })('not_found', { kind: 'blog' })).toBe(
			false
		)
	})

	test('un événement invalide n’est jamais remis à Umami, même s’il est typé de force', () => {
		const { fenetre, suivis } = navigateur()
		const forcer = suivre({ fenetre, production: true }) as unknown as (nom: string, proprietes: unknown) => boolean
		expect(forcer('inconnu', {})).toBe(false)
		expect(forcer('cta_click', { where: 'cta_recherche', email: 'lea@example.test' })).toBe(false)
		expect(forcer('cta_click', { where: 'saisi' })).toBe(false)
		expect(suivis).toEqual([])
	})

	test('rien ne se lève : Umami qui échoue, une fenêtre qui lève à la lecture', () => {
		const casse = navigateur({
			umami: {
				track: () => {
					throw new Error('boum')
				},
			},
		})
		expect(suivre({ fenetre: casse.fenetre, production: true })('not_found', { kind: 'blog' })).toBe(false)
		const piege = {
			get navigator(): never {
				throw new Error('boum')
			},
		} as MeasuredWindow
		expect(suivre({ fenetre: piege, production: true })('not_found', { kind: 'blog' })).toBe(false)
	})
})

describe('un seul chemin vers Umami (test statique)', () => {
	const RACINE = path.resolve(import.meta.dir, '../..')
	/** The only code that knows Umami: the module of the measure, its relay and the environment. */
	const AUTORISES = new Set([
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
	const APPEL_DIRECT =
		/window\.umami|\bumami\.track|data-umami-event|mmAttenteUmami|mmAvantEnvoi|umami\.wadefade|fetch\(\s*['"`]\/u\//i

	function sources(dossier: string): string[] {
		return readdirSync(path.join(RACINE, dossier), { recursive: true, withFileTypes: true })
			.filter(entree => entree.isFile() && /\.(ts|tsx|js|jsx|mjs|css)$/.test(entree.name))
			.map(entree => path.relative(RACINE, path.join(entree.parentPath, entree.name)))
	}

	test('aucun appel à Umami dans les sources, hors du module de la mesure', () => {
		const fautifs = [...sources('src'), 'next.config.ts']
			.filter(fichier => !AUTORISES.has(fichier))
			.filter(fichier => APPEL_DIRECT.test(readFileSync(path.join(RACINE, fichier), 'utf8')))
		expect(fautifs).toEqual([])
	})

	test('le test voit ce qu’il cherche : il trouve les appels du module', () => {
		const trouves = [...AUTORISES].filter(fichier =>
			APPEL_DIRECT.test(readFileSync(path.join(RACINE, fichier), 'utf8'))
		)
		expect(trouves).toContain('src/lib/analytics/track.ts')
		expect(trouves).toContain('src/lib/analytics/umami.ts')
	})

	test('une page n’émet que par track() : aucun composant n’importe le module de bas niveau', () => {
		const importeurs = sources('src')
			.filter(fichier => !fichier.startsWith('src/lib/analytics/'))
			.filter(fichier =>
				/from ['"](@\/lib\/analytics\/(umami|relay)|\.\.?\/.*analytics\/(umami|relay))['"]/.test(
					readFileSync(path.join(RACINE, fichier), 'utf8')
				)
			)
		expect(importeurs.sort()).toEqual(
			['src/app/(front)/layout.tsx', 'src/app/u/api/send/route.ts', 'src/app/u/script.js/route.ts'].sort()
		)
	})
})

describe('à la compilation : un nom inconnu ou une propriété en trop ne passent pas', () => {
	// Never called: `bun run typecheck` reads these lines, and fails when one of the errors is missing.
	// biome-ignore lint/correctness/noUnusedVariables: read by the compiler only
	function compilation(): void {
		const suivi = createTrack(() => ({ fenetre: undefined, production: false }))
		suivi('contact_click', { pid: 1, channel: 'email' })
		suivi('profile_publiable')
		suivi('login_result', { method: 'google', ok: true, code: 'ok' })
		// @ts-expect-error unknown event name
		suivi('inconnu', {})
		// @ts-expect-error the events of the quote form are not in the catalogue
		suivi('devis_click', { pid: 1, from: 'profil' })
		// @ts-expect-error extra property
		suivi('contact_click', { pid: 1, channel: 'email', nom: 'Léa' })
		// @ts-expect-error missing property
		suivi('contact_click', { pid: 1 })
		// @ts-expect-error value out of its list
		suivi('contact_click', { pid: 1, channel: 'telegram' })
		// @ts-expect-error wrong type of value
		suivi('search_submit', { has_city: 'oui', results: '0', from: 'lien' })
		// @ts-expect-error an event without properties takes none
		suivi('profile_publiable', { ok: true })
		// @ts-expect-error an event with properties needs them
		suivi('cta_click')
		// @ts-expect-error a pid is a number or v3-<id>
		suivi('contact_click', { pid: 'abc', channel: 'email' })
	}
	test('les lignes @ts-expect-error de ce bloc sont vérifiées par « bun run typecheck »', () => {
		expect(typeof compilation).toBe('function')
	})
})

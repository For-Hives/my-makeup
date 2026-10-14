import { describe, expect, test } from 'bun:test'
import {
	ADRESSE_DE_LA_PREPROD,
	ControleRefuse,
	controler,
	defautsDeLaPage,
	type Lire,
	lireLesReglages,
	type Outils,
	PROFIL_FICTIF,
	titresDeLaPage,
	type Variables,
} from '../../scripts/preprod/controle'
import { nomAffiche } from '../../src/lib/profil/nom-affiche'
import { attribuerSlugs } from '../../src/lib/slug'
import { definitionDeLaSource } from '../outils/source-strapi/donnees'

/**
 * Ticket 027: the check the CI runs against the pre-production (scripts/preprod/controle.ts). No
 * request leaves this machine: every answer of the pre-production is played by a fake `fetch`.
 */

// Made-up credentials: they open nothing.
const IDENTIFIANTS: Variables = { PREPROD_BASIC_AUTH_USER: 'preprod', PREPROD_BASIC_AUTH_PASSWORD: 'factice-027' }
const COMMIT = 'abc1234def5678abc1234def5678abc1234def56'

const PAGE = `<!DOCTYPE html><html><body><main><h1 class="break-words font-bold">${PROFIL_FICTIF.nom}</h1><p>Mariage</p></main></body></html>`

interface Appel {
	adresse: string
	init: RequestInit
}

/** A fake pre-production: each path answers in turn with what the list gives, the last answer repeated. */
function preprodSimulee(reponses: Record<string, (() => Response)[]>): { lire: Lire; appels: Appel[] } {
	const appels: Appel[] = []
	const rang: Record<string, number> = {}
	const lire: Lire = async (adresse, init) => {
		appels.push({ adresse, init })
		const chemin = new URL(adresse).pathname
		const suite = reponses[chemin] ?? [() => new Response('introuvable', { status: 404 })]
		const n = rang[chemin] ?? 0
		rang[chemin] = n + 1
		const reponse = suite[Math.min(n, suite.length - 1)]
		if (!reponse) throw new Error('aucune réponse')
		return reponse()
	}
	return { lire, appels }
}

const sante = (version: string) => () => Response.json({ ok: true, version })

/** Tools with a clock that moves when the check waits: no real wait. */
function outils(lire: Lire): Outils & { journal: (ligne: string) => void; lignes: string[]; attentes: number[] } {
	let horloge = 0
	const lignes: string[] = []
	const attentes: number[] = []
	return {
		lire,
		lignes,
		attentes,
		journal: ligne => lignes.push(ligne),
		attendre: async ms => {
			attentes.push(ms)
			horloge += ms
		},
		maintenant: () => horloge,
	}
}

describe('the fictional profile it reads is the one the import gives', () => {
	test('profile 21 of the fake source: its slug by the rule of the old site, its name as the page shows it', () => {
		const { lignes } = definitionDeLaSource('https://medias.source-fictive.example.test')
		const profil = lignes.makeup_artistes.find(ligne => ligne.id === 21)
		const slugs = attribuerSlugs(
			lignes.makeup_artistes.map(({ id, username, created_at }) => ({
				id: Number(id),
				username: String(username),
				createdAt: `${String(created_at).replace(' ', 'T')}Z`,
			}))
		)

		expect(slugs.find(({ id }) => id === 21)?.slug).toBe(PROFIL_FICTIF.slug)
		expect(
			nomAffiche({
				prenom: String(profil?.first_name ?? ''),
				nom: String(profil?.last_name ?? ''),
				nomArtiste: (profil?.company_artist_name as string | null) ?? null,
			})
		).toBe(PROFIL_FICTIF.nom)
	})
})

describe('what it may read, and with what', () => {
	test('the pre-production by default, with the access header built from the two secrets', () => {
		expect(lireLesReglages({ ...IDENTIFIANTS, CONTROLE_PREPROD_COMMIT: COMMIT })).toEqual({
			adresse: ADRESSE_DE_LA_PREPROD,
			autorisation: `Basic ${btoa('preprod:factice-027')}`,
			commit: 'abc1234',
		})
	})

	test('without the two secrets, the pre-production is refused, and the message names them without a value', () => {
		expect(() => lireLesReglages({})).toThrow(ControleRefuse)
		expect(() => lireLesReglages({ PREPROD_BASIC_AUTH_USER: 'preprod' })).toThrow(
			'PREPROD_BASIC_AUTH_USER et PREPROD_BASIC_AUTH_PASSWORD sont obligatoires'
		)
	})

	test('a build of this machine is read without credentials', () => {
		expect(lireLesReglages({ CONTROLE_PREPROD_ADRESSE: 'http://127.0.0.1:3227' })).toEqual({
			adresse: 'http://127.0.0.1:3227',
		})
	})

	test.each([
		'https://my-makeup.fr',
		'https://www.my-makeup.fr',
		'https://v3.my-makeup.fr',
		'https://preprod.my-makeup.fr/',
		'http://preprod.my-makeup.fr',
		'https://preprod.my-makeup.fr.example.test',
		'http://192.168.1.10:3000',
		'http://127.0.0.1:3227/profil',
	])('never the site, nor any other address: %s', adresse => {
		expect(() => lireLesReglages({ ...IDENTIFIANTS, CONTROLE_PREPROD_ADRESSE: adresse })).toThrow(
			'CONTROLE_PREPROD_ADRESSE refusée'
		)
	})

	test('a commit that is not one is refused', () => {
		expect(() => lireLesReglages({ ...IDENTIFIANTS, CONTROLE_PREPROD_COMMIT: 'main' })).toThrow(
			'CONTROLE_PREPROD_COMMIT refusée'
		)
	})
})

describe('the page: 200, and the name in its only h1', () => {
	test('the h1 of the HTML of the server, tags inside removed and entities decoded', () => {
		expect(titresDeLaPage(PAGE)).toEqual([PROFIL_FICTIF.nom])
		expect(titresDeLaPage('<h1>A &amp; B <span>C</span></h1><h1 id="x">D&#x27;E</h1><h10>F</h10>')).toEqual([
			'A & B C',
			"D'E",
		])
	})

	test.each([
		[404, PAGE, 'la page répond 404, pas 200'],
		[200, '<main><p>sans titre</p></main>', 'la page porte 0 titres h1, il en faut un seul'],
		[200, `${PAGE}<h1>Autre</h1>`, 'la page porte 2 titres h1, il en faut un seul'],
		[200, '<h1>Autre maquilleuse</h1>', 'le h1 de la page n’est pas « Zoé Lefèvre »'],
	])('red on %d: %s', (statut, html, defaut) => {
		expect(defautsDeLaPage(statut, html)).toEqual([defaut])
	})

	test('green on the page of the profile', () => {
		expect(defautsDeLaPage(200, PAGE)).toEqual([])
	})
})

describe('the whole check, against a fake pre-production', () => {
	test('it waits for the commit, then reads the page: exit 0; GET only, no redirect followed, the header sent, never printed', async () => {
		const { lire, appels } = preprodSimulee({
			'/api/health': [sante('0000000'), sante('0000000'), () => new Response('', { status: 502 }), sante('abc1234')],
			'/profil/zoe-lefevre': [() => new Response(PAGE, { status: 200 })],
		})
		const o = outils(lire)

		expect(await controler({ ...IDENTIFIANTS, CONTROLE_PREPROD_COMMIT: COMMIT }, o)).toBe(0)
		expect(o.lignes).toEqual([
			'Contrôle de https://preprod.my-makeup.fr.',
			'version servie 0000000 ; attendue : abc1234. Nouvel essai toutes les 15 s.',
			'/api/health répond 502 ; attendue : abc1234. Nouvel essai toutes les 15 s.',
			'Version servie : abc1234, celle du commit attendu.',
			'Profil fictif /profil/zoe-lefevre : 200, « Zoé Lefèvre » dans le seul h1 du HTML du serveur.',
		])
		expect(appels.map(({ adresse }) => adresse)).toEqual([
			...Array.from({ length: 4 }, () => 'https://preprod.my-makeup.fr/api/health'),
			'https://preprod.my-makeup.fr/profil/zoe-lefevre',
		])
		for (const { init } of appels) {
			expect(init.method ?? 'GET').toBe('GET')
			expect(init.redirect).toBe('manual')
			expect(init.headers).toEqual({ Authorization: `Basic ${btoa('preprod:factice-027')}` })
		}
		expect(o.lignes.join('\n')).not.toContain('factice-027')
	})

	test('the profile missing from the pre-production: exit 1, and the log says why', async () => {
		const o = outils(preprodSimulee({ '/api/health': [sante('abc1234')] }).lire)

		expect(await controler({ ...IDENTIFIANTS, CONTROLE_PREPROD_COMMIT: COMMIT }, o)).toBe(1)
		expect(o.lignes.at(-1)).toBe(
			'Contrôle de la préprod en échec : Profil fictif /profil/zoe-lefevre : la page répond 404, pas 200.'
		)
	})

	test('a deployment that never comes: it gives up after its wait, exit 1', async () => {
		const o = outils(preprodSimulee({ '/api/health': [sante('0000000')] }).lire)

		expect(await controler({ ...IDENTIFIANTS, CONTROLE_PREPROD_COMMIT: COMMIT }, o)).toBe(1)
		expect(o.attentes.reduce((total, ms) => total + ms, 0)).toBeLessThanOrEqual(20 * 60_000)
		expect(o.lignes.at(-1)).toBe(
			'Contrôle de la préprod en échec : La préprod ne sert pas le commit abc1234 après 20 minutes (version servie 0000000) : le déploiement est en retard ou en échec, voir Coolify.'
		)
	})

	test('wrong credentials: exit 1 at once, without waiting', async () => {
		const o = outils(preprodSimulee({ '/api/health': [() => new Response('', { status: 401 })] }).lire)

		expect(await controler(IDENTIFIANTS, o)).toBe(1)
		expect(o.attentes).toEqual([])
		expect(o.lignes.at(-1)).toContain('La préprod refuse l’accès (401)')
	})

	test('an unreachable pre-production is said by its code, never by the text of the error', async () => {
		const injoignable: Lire = () =>
			Promise.reject(
				Object.assign(new TypeError('fetch failed for preprod:factice-027'), { cause: { code: 'ECONNREFUSED' } })
			)
		const o = outils(injoignable)

		expect(await controler(IDENTIFIANTS, { ...o, attenteMaxMs: 30_000 })).toBe(1)
		expect(o.lignes).toContain(
			'/api/health ne répond pas (ECONNREFUSED) ; attendue : une réponse 200. Nouvel essai toutes les 15 s.'
		)
		expect(o.lignes.join('\n')).not.toContain('factice-027')
	})
})

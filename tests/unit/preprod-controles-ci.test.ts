import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
	ADRESSE_DE_LA_PREPROD,
	APPLICATION_PREPROD,
	etatDeLaRemise,
	FORME_DU_JETON,
	jetonDeRemise,
	lireLesReglages,
	type Outils,
	RemiseRefusee,
	remettreLaPreprod,
	VARIABLE_DE_REMISE,
	type Variables,
} from '../../scripts/preprod/remise-ci'
import { JETON_DE_REMISE_A_ZERO } from '../../src/lib/env'

/**
 * Ticket 174: the manual run of the CI that puts the pre-production back to its seeded state, then plays
 * the quick journeys and the check of a host (.github/workflows/preprod-controles.yml,
 * scripts/preprod/remise-ci.ts). No request leaves this machine: Coolify and the pre-production are played
 * by a fake `fetch`. Credentials below are made up and open nothing.
 */

const RACINE = path.resolve(import.meta.dir, '../..')
const lire = (fichier: string): string => readFileSync(path.join(RACINE, fichier), 'utf8')

const COOLIFY = 'https://coolify.example.test'
const SECRET_COOLIFY = 'jeton-coolify-factice-174'
const MOT_DE_PASSE = 'mot-de-passe-factice-174'
const VARIABLES: Variables = {
	COOLIFY_URL: COOLIFY,
	COOLIFY_TOKEN: SECRET_COOLIFY,
	PREPROD_BASIC_AUTH_USER: 'preprod',
	PREPROD_BASIC_AUTH_PASSWORD: MOT_DE_PASSE,
	REMISE_IDENTIFIANT: '9876543210',
	REMISE_TENTATIVE: '2',
}
const JETON = 'ci-9876543210-2'

interface Appel {
	methode: string
	adresse: string
	corps: unknown
	entetes: Headers
}

interface Scenario {
	fqdn?: string
	patch?: number
	post?: number
	restart?: number
	/** The log of the application, in turn: the last one repeats. */
	journaux?: string[]
	statutDuJournal?: number
}

/** Coolify and the pre-production, played. */
function coolifySimule(scenario: Scenario = {}): { lire: Outils['lire']; appels: Appel[] } {
	const appels: Appel[] = []
	let n = 0
	const racine = `/api/v1/applications/${APPLICATION_PREPROD}`
	const lireFaux: Outils['lire'] = async (adresse, init) => {
		const url = new URL(adresse)
		const methode = init.method ?? 'GET'
		appels.push({
			methode,
			adresse: `${url.host}${url.pathname}`,
			corps: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
			entetes: new Headers(init.headers),
		})
		if (url.host === 'preprod.my-makeup.fr') return Response.json({ ok: true })
		if (url.pathname === racine && methode === 'GET')
			return Response.json({ fqdn: scenario.fqdn ?? ADRESSE_DE_LA_PREPROD })
		if (url.pathname === `${racine}/envs` && methode === 'PATCH')
			return new Response('{}', { status: scenario.patch ?? 200 })
		if (url.pathname === `${racine}/envs` && methode === 'POST')
			return new Response('{}', { status: scenario.post ?? 201 })
		if (url.pathname === `${racine}/restart`) return new Response('{}', { status: scenario.restart ?? 200 })
		if (url.pathname === `${racine}/logs`) {
			const journaux = scenario.journaux ?? [
				`[preprod] Remise à zéro « ${JETON} » faite : 1 migration rejouée sur une base vide.`,
			]
			const texte = journaux[Math.min(n++, journaux.length - 1)] ?? ''
			return scenario.statutDuJournal
				? new Response('', { status: scenario.statutDuJournal })
				: Response.json({ logs: texte })
		}
		return new Response('introuvable', { status: 404 })
	}
	return { lire: lireFaux, appels }
}

function outils(lireFaux: Outils['lire']): Outils & { lignes: string[] } {
	let horloge = 0
	const lignes: string[] = []
	return {
		lire: lireFaux,
		lignes,
		journal: ligne => lignes.push(ligne),
		attendre: async ms => {
			horloge += ms
		},
		maintenant: () => horloge,
		attenteMaxMs: 60_000,
		intervalleMs: 10_000,
	}
}

describe('le jeton de remise', () => {
	test('il vient du lancement, il a la forme que la préprod accepte, et change à chaque relance', () => {
		expect(jetonDeRemise('9876543210', '2')).toBe(JETON)
		expect(jetonDeRemise('9876543210', undefined)).toBe('ci-9876543210-1')
		expect(jetonDeRemise('9876543210', '3')).not.toBe(jetonDeRemise('9876543210', '2'))
		expect(FORME_DU_JETON.source).toBe(JETON_DE_REMISE_A_ZERO.source)
		expect(FORME_DU_JETON.test(JETON)).toBe(true)
	})

	test('sans numéro de lancement : refusé', () => {
		for (const mauvais of [undefined, '', 'abc', '12 34', '../1'])
			expect(() => jetonDeRemise(mauvais, '1')).toThrow(RemiseRefusee)
	})
})

describe('les réglages', () => {
	test('Coolify en https, un jeton, et rien d’autre', () => {
		expect(lireLesReglages(VARIABLES).coolify).toBe(COOLIFY)
		expect(lireLesReglages({ ...VARIABLES, COOLIFY_URL: `${COOLIFY}/` }).coolify).toBe(COOLIFY)
		for (const url of ['', 'http://coolify.example.test', 'https://u:p@coolify.example.test', 'pas une adresse'])
			expect(() => lireLesReglages({ ...VARIABLES, COOLIFY_URL: url })).toThrow(RemiseRefusee)
		expect(() => lireLesReglages({ ...VARIABLES, COOLIFY_TOKEN: '' })).toThrow(RemiseRefusee)
	})
})

describe('la remise à l’état semé', () => {
	test('dans l’ordre : Coolify confirme la préprod, une seule variable, le redémarrage, le journal', async () => {
		const { lire: lireFaux, appels } = coolifySimule({
			journaux: ['rien', `[preprod] Remise à zéro « ${JETON} » faite : 1 migration rejouée sur une base vide.`],
		})
		const o = outils(lireFaux)
		expect(await remettreLaPreprod(VARIABLES, o)).toBe(0)
		const coolify = appels.filter(({ adresse }) => adresse.startsWith('coolify.'))
		expect(coolify.slice(0, 3).map(({ methode, adresse }) => `${methode} ${adresse}`)).toEqual([
			`GET coolify.example.test/api/v1/applications/${APPLICATION_PREPROD}`,
			`PATCH coolify.example.test/api/v1/applications/${APPLICATION_PREPROD}/envs`,
			`POST coolify.example.test/api/v1/applications/${APPLICATION_PREPROD}/restart`,
		])
		expect(coolify[1]?.corps).toEqual({ key: VARIABLE_DE_REMISE, value: JETON, is_preview: false })
		expect(o.lignes.join('\n')).toContain(`Remise à zéro « ${JETON} » faite`)
	})

	test('une variable qui n’existe pas encore est créée', async () => {
		const { lire: lireFaux, appels } = coolifySimule({ patch: 404 })
		expect(await remettreLaPreprod(VARIABLES, outils(lireFaux))).toBe(0)
		expect(appels.map(({ methode, adresse }) => `${methode} ${adresse}`)).toContain(
			`POST coolify.example.test/api/v1/applications/${APPLICATION_PREPROD}/envs`
		)
	})

	test('U86 : si Coolify ne dit pas que l’application est la préprod seule, rien n’est écrit', async () => {
		for (const fqdn of [
			'https://my-makeup.fr',
			'https://www.my-makeup.fr',
			'https://api.my-makeup.fr',
			'https://preprod.my-makeup.fr,https://my-makeup.fr',
			'https://autre.example.test',
			'',
		]) {
			const { lire: lireFaux, appels } = coolifySimule({ fqdn })
			const o = outils(lireFaux)
			expect(await remettreLaPreprod(VARIABLES, o)).toBe(1)
			expect(appels.filter(({ methode }) => methode !== 'GET')).toEqual([])
			expect(o.lignes.join('\n')).toContain('Remise refusée')
		}
	})

	test('elle ne vise que l’application de la préprod, et n’écrit que la variable de remise', async () => {
		const { lire: lireFaux, appels } = coolifySimule()
		await remettreLaPreprod(VARIABLES, outils(lireFaux))
		const ecritures = appels.filter(({ methode }) => methode !== 'GET')
		expect(ecritures.length).toBeGreaterThan(0)
		for (const { adresse, corps } of ecritures) {
			expect(adresse).toContain(`/applications/${APPLICATION_PREPROD}/`)
			if (corps) expect((corps as { key: string }).key).toBe(VARIABLE_DE_REMISE)
		}
		// The variables of the application are never read (they may hold secrets), nor the database touched.
		expect(appels.some(({ adresse, methode }) => methode === 'GET' && adresse.endsWith('/envs'))).toBe(false)
		expect(JSON.stringify(appels.map(({ corps }) => corps))).not.toContain('DATABASE')
	})

	test('un jeton refusé par Coolify : un échec qui le dit, rien n’est écrit', async () => {
		const faux: Outils['lire'] = async () => new Response('', { status: 401 })
		const o = outils(faux)
		expect(await remettreLaPreprod(VARIABLES, o)).toBe(1)
		expect(o.lignes.join('\n')).toContain('COOLIFY_TOKEN')
	})

	test('la préprod qui refuse la remise, ou qui l’avait déjà faite : échec', async () => {
		for (const [ligne, dit] of [
			[`Remise à zéro « ${JETON} » non faite, la base est gardée. Autre base.`, 'refusé la remise'],
			[`Remise à zéro « ${JETON} » interrompue, la base est gardée (Error).`, 'refusé la remise'],
			[`Remise à zéro « ${JETON} » déjà faite : rien n’est effacé.`, 'déjà eu lieu'],
		] as const) {
			const { lire: lireFaux } = coolifySimule({ journaux: [ligne] })
			const o = outils(lireFaux)
			expect(await remettreLaPreprod(VARIABLES, o)).toBe(1)
			expect(o.lignes.join('\n')).toContain(dit)
		}
	})

	test('la remise d’un autre jeton n’est pas la nôtre : le journal doit nommer le jeton de ce lancement', async () => {
		expect(etatDeLaRemise('Remise à zéro « ci-1-1 » faite : 1 migration', JETON)).toBe('inconnu')
		expect(etatDeLaRemise(`Remise à zéro « ${JETON} » faite : 1 migration`, JETON)).toBe('faite')
	})

	test('un journal qui ne dit jamais la remise : échec après le délai, sans attente réelle', async () => {
		const { lire: lireFaux } = coolifySimule({ journaux: ['rien'] })
		const o = outils(lireFaux)
		expect(await remettreLaPreprod(VARIABLES, o)).toBe(1)
		expect(o.lignes.join('\n')).toContain('n’est pas faite après')
	})

	test('aucun secret n’est écrit : ni le jeton de Coolify, ni le mot de passe, ni son encodage', async () => {
		for (const scenario of [{}, { fqdn: 'https://my-makeup.fr' }, { journaux: ['rien'] }, { restart: 500 }]) {
			const { lire: lireFaux } = coolifySimule(scenario)
			const o = outils(lireFaux)
			await remettreLaPreprod(VARIABLES, o)
			const tout = o.lignes.join('\n')
			for (const secret of [SECRET_COOLIFY, MOT_DE_PASSE, btoa(`preprod:${MOT_DE_PASSE}`)])
				expect(tout).not.toContain(secret)
		}
	})

	test('le jeton de Coolify ne part que vers Coolify, l’accès protégé que vers la préprod', async () => {
		const { lire: lireFaux, appels } = coolifySimule()
		await remettreLaPreprod(VARIABLES, outils(lireFaux))
		for (const { adresse, entetes } of appels) {
			const auth = entetes.get('authorization') ?? ''
			if (adresse.startsWith('coolify.')) expect(auth).toBe(`Bearer ${SECRET_COOLIFY}`)
			else {
				expect(adresse.startsWith('preprod.my-makeup.fr/')).toBe(true)
				expect(auth.startsWith('Basic ')).toBe(true)
			}
		}
	})
})

describe('le workflow des contrôles de la préprod', () => {
	const texte = lire('.github/workflows/preprod-controles.yml')
	const sansCommentaires = texte
		.split('\n')
		.filter(ligne => !ligne.trim().startsWith('#'))
		.join('\n')

	test('il se lance à la main seulement, et refuse toute autre branche que v3', () => {
		expect(sansCommentaires).toMatch(/^on:\n {2}workflow_dispatch:\n/m)
		expect(sansCommentaires).not.toMatch(/\b(push|pull_request|schedule)\s*:/)
		expect(sansCommentaires).toContain('test "$GITHUB_REF" = "refs/heads/v3" || exit 1')
		// The refusal comes before the code of the branch is fetched.
		expect(sansCommentaires.indexOf('refs/heads/v3')).toBeLessThan(sansCommentaires.indexOf('actions/checkout'))
	})

	test('U86 : sa seule cible est la préprod, le site n’y est jamais nommé', () => {
		const hotes = [...sansCommentaires.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map(([, hote]) => hote)
		expect(hotes.length).toBeGreaterThan(0)
		expect(new Set(hotes)).toEqual(new Set(['preprod.my-makeup.fr']))
		expect(sansCommentaires).not.toMatch(/\bBASE_URL\b|SONDES_CIBLE/)
		expect(sansCommentaires).toContain('CONTROLE_HOTE_CIBLE: https://preprod.my-makeup.fr')
	})

	test('l’ordre : la remise, les parcours rapides, le contrôle de l’hôte', () => {
		const ordre = ['preprod:remise-ci', 'preprod:controle', 'bascule:controle'].map(commande =>
			sansCommentaires.indexOf(`bun run ${commande}`)
		)
		expect(ordre.every(rang => rang > 0)).toBe(true)
		expect([...ordre].sort((a, b) => a - b)).toEqual(ordre)
	})

	test('aucune installation, aucun secret hors d’un bloc env, aucune valeur écrite', () => {
		expect(sansCommentaires).not.toMatch(/bun install|npm (ci|install)|setup-node/)
		for (const ligne of sansCommentaires.split('\n').filter(l => l.includes('secrets.')))
			expect(ligne).toMatch(/^\s+[A-Z_]+: \$\{\{ secrets\.[A-Z_]+ \}\}$/)
		expect(sansCommentaires).not.toMatch(/\bset -x\b|--verbose|echo \$\{\{/)
	})

	test('les scripts qu’il lance existent et sont ceux de package.json', () => {
		const scripts = (JSON.parse(lire('package.json')) as { scripts: Record<string, string> }).scripts
		expect(scripts['preprod:remise-ci']).toContain('scripts/preprod/lancer-remise-ci.ts')
		expect(scripts['preprod:controle']).toContain('scripts/preprod/controle.ts')
		expect(scripts['bascule:controle']).toContain('scripts/bascule/lancer-controle-hote.ts')
	})
})

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { CaseToReview } from '../../scripts/migration/import/cities'
import type { Decisions } from '../../scripts/migration/import/decisions'
import { geoApiReference, keptReference, REFERENCE_ADDRESS } from '../../scripts/migration/import/reference'
import { HttpResponse, http, simuler } from '../support/outgoing-http'
import {
	commandeDImport,
	DECISIONS_DU_BANC,
	FICHIER_DES_DECISIONS_DU_BANC,
	FICHIER_DU_REFERENTIEL_DU_BANC,
	importerSurLeBanc,
	referentielDuBanc,
} from '../support/import'
import { payloadDeTest, viderLaBase } from '../support/payload-test'
import { creerLaSourceStrapi, effacerLaSourceStrapi, empreinteDeLaSource } from '../support/source-strapi'

/**
 * Ticket 063: the city typed in a profile of the fake source becomes a commune of the official
 * list, with its INSEE code, never an address (plan 01 §6.2 « Ville »; plan 03 SEO-24). The
 * referential is read offline from its kept answers (tests/fixtures/import/referentiel-du-banc.json),
 * or simulated: no test calls the Internet.
 *
 * The cities of the fake source (docs/tests/source-strapi.md): 21 « Annecy », 22 « 74000 Annecy »,
 * 23 a postal address in Annecy, 24 « Toulouse (31) », 25 « 75116 », 26 « France », 28
 * « Saint-Julien » (six communes), 30 « annecy », 32 « Lyon », 33 « Nantes », 34 « Annemasse »;
 * 27 and 31 have none.
 */

/** The decision lines a person would write after reading the private list of review. */
const DECISIONS_DES_COMMUNES: Decisions = {
	...DECISIONS_DU_BANC,
	cities: [
		// The Saint-Julien of the Rhône, one of the six candidates.
		{ profile: 28, inseeCode: '69215' },
		// « France » is no commune: the zone stays empty, reviewed.
		{ profile: 26, inseeCode: null },
	],
}

let revue: CaseToReview[] = []
let premier: Awaited<ReturnType<typeof importerSurLeBanc>>

beforeAll(async () => {
	await viderLaBase()
	await creerLaSourceStrapi()
	premier = await importerSurLeBanc('real', {
		onReview: cas => {
			revue = cas
		},
	})
	// The first run of the file starts Payload on the bench: longer than the default 5 s.
}, 60_000)

afterAll(async () => {
	await viderLaBase()
	await effacerLaSourceStrapi()
})

async function profils(overrideAccess = true) {
	const payload = await payloadDeTest()
	const { docs } = await payload.find({
		collection: 'profiles',
		depth: 0,
		pagination: false,
		overrideAccess,
		// The public may not sort on what the import wrote.
		sort: overrideAccess ? 'strapiId' : 'slug',
	})
	return docs
}

const communeDe = async (strapiId: number) => (await profils()).find(profil => profil.strapiId === strapiId)?.city

describe('Commune simple, avec code postal, et adresse postale : la bonne commune', () => {
	test('chaque ville devient sa commune, avec son code INSEE, son département et son centre à 1 km', async () => {
		const annecy = { name: 'Annecy', inseeCode: '74010', department: '74', latitude: 45.9, longitude: 6.13 }

		for (const id of [21, 22, 23, 30]) expect(await communeDe(id), String(id)).toEqual(annecy)
		const codes = Object.fromEntries((await profils()).map(({ strapiId, city }) => [strapiId, city?.inseeCode ?? null]))
		expect(codes).toEqual({
			21: '74010',
			22: '74010',
			23: '74010',
			24: '31555',
			25: '75056',
			26: null,
			27: null,
			28: null,
			30: '74010',
			31: null,
			32: '69123',
			33: '44109',
			34: '74012',
		})
		expect(await communeDe(25)).toMatchObject({ name: 'Paris', department: '75' })
	})

	test('l’adresse postale n’est jamais importée : aucune rue dans aucun champ, public ou non ; le profil est signalé', async () => {
		const tout = JSON.stringify(await profils())

		for (const morceau of ['impasse', 'Pinceaux', '74000']) expect(tout).not.toContain(morceau)
		expect(premier.collections.profiles?.cities?.addresses).toEqual([23])
		// The public reads the commune of a published profile, and no street.
		const publics = await profils(false)
		expect(publics.find(({ slug }) => slug === 'zoe-lefevre')?.city).toMatchObject({
			name: 'Annecy',
			inseeCode: '74010',
		})
		expect(JSON.stringify(publics)).not.toContain('Pinceaux')
	})

	test('la part des villes renseignées rattachées à une commune est donnée en nombres (cible 90 %)', () => {
		expect(premier.collections.profiles?.cities).toEqual({
			filledCities: 11,
			attached: 9,
			part: 81.8,
			nonEmptyProfiles: 12,
			nonEmptyProfilesWithCity: 9,
			toReview: [26, 28],
			addresses: [23],
			decided: [],
		})
		expect(premier.gaps['ville-en-commune']).toBe(11)
		expect(premier.parity?.profiles).toMatchObject({ expected: 13, equal: 13, different: [] })
	})
})

describe('Cas ambigu : zone vide, profil « à revoir » ; avec sa ligne de décision, la commune choisie', () => {
	test('sans décision : la zone reste vide, le profil part dans la liste de revue privée, avec ses communes possibles', async () => {
		expect([await communeDe(26), await communeDe(28)]).toEqual([
			{ name: null, inseeCode: null, department: null, latitude: null, longitude: null },
			{ name: null, inseeCode: null, department: null, latitude: null, longitude: null },
		])
		expect(revue.map(({ profil, motif }) => [profil, motif])).toEqual([
			[26, 'pas-une-commune'],
			[28, 'homonymes'],
		])
		expect(revue[1]?.candidats.map(({ code }) => code)).toEqual(['21555', '22307', '34271', '69215', '83113', '88421'])
		expect(JSON.stringify(revue)).not.toContain('France')
	})

	test('avec sa ligne de décision : la commune choisie, ou aucune, et le profil n’est plus à revoir', async () => {
		const rapport = await importerSurLeBanc('real', { decisions: DECISIONS_DES_COMMUNES })

		expect(rapport.collections.profiles).toMatchObject({ created: 0, updated: 1 })
		expect(await communeDe(28)).toEqual({
			name: 'Saint-Julien',
			inseeCode: '69215',
			department: '69',
			latitude: 46.03,
			longitude: 4.65,
		})
		expect(rapport.collections.profiles?.cities).toMatchObject({
			attached: 10,
			part: 90.9,
			toReview: [],
			decided: [26, 28],
		})
		expect(rapport.pointlessDecisions).toBe(0)
	})

	test('second passage avec les mêmes décisions : 0 création, 0 mise à jour', async () => {
		const avant = await profils()

		const second = await importerSurLeBanc('real', { decisions: DECISIONS_DES_COMMUNES })

		expect(second.collections.profiles).toMatchObject({ created: 0, updated: 0, refused: [] })
		expect(await profils()).toEqual(avant)
	})
})

describe('Le référentiel simulé, et ses réponses gardées pour deux passages identiques', () => {
	/** The kept answers of the bench, sent back as the referential sends them. */
	function simulerAvecLesReponsesDuBanc(): string[] {
		const reponses = referentielDuBanc().reponses
		const journal: string[] = []
		simuler(
			http.get(`${REFERENCE_ADDRESS}/communes`, ({ request }) => {
				journal.push(request.url)
				const parametres = new URL(request.url).searchParams
				const [genre, valeur] = parametres.has('nom')
					? ['nom', parametres.get('nom')]
					: ['codePostal', parametres.get('codePostal')]
				return HttpResponse.json(
					(reponses.get(`${genre}:${valeur}`) ?? []).map(({ departement, latitude, longitude, ...city }) => ({
						...city,
						codeDepartement: departement,
						centre: { type: 'Point', coordinates: [longitude, latitude] },
					}))
				)
			})
		)
		return journal
	}

	test('un premier passage demande chaque ville une fois ; le second ne demande rien et donne la même chose', async () => {
		const journal = simulerAvecLesReponsesDuBanc()
		const garde = keptReference(new Map(), geoApiReference())

		const un = await importerSurLeBanc('dry-run', { decisions: DECISIONS_DES_COMMUNES, reference: garde })
		const demandes = journal.length
		const deux = await importerSurLeBanc('dry-run', { decisions: DECISIONS_DES_COMMUNES, reference: garde })

		// annecy, 74000, toulouse, 75116, saint-julien, lyon, nantes, annemasse.
		expect(demandes).toBe(8)
		expect(garde.nouvelles()).toBe(8)
		expect(journal).toHaveLength(demandes)
		expect(deux.collections.profiles).toEqual(un.collections.profiles)
		expect(un.collections.profiles).toMatchObject({ created: 0, updated: 0 })
	})
})

describe('La commande', () => {
	let dossier = ''

	beforeAll(() => {
		dossier = mkdtempSync(path.join(tmpdir(), 'communes-import-'))
	})

	afterAll(() => rmSync(dossier, { recursive: true, force: true }))

	test('--review écrit la liste de revue privée, lisible par son seul propriétaire, sans le texte saisi', async () => {
		const fichier = path.join(dossier, 'revue.json')

		// A dry run, with the table of the bench, which settles no city.
		const { code, sortie } = await commandeDImport(['--decisions', FICHIER_DES_DECISIONS_DU_BANC, '--review', fichier])

		expect(code, sortie).toBe(0)
		expect(sortie).toContain('communes : 9 sur 11 villes renseignées (81,8 %, cible 90 %)')
		expect(sortie).toContain('villes à revoir, zone vide (liste de revue privée, --review) : 26, 28')
		expect(sortie).toContain('adresses postales, dont seule la commune est reprise : 23')
		expect(statSync(fichier).mode & 0o777).toBe(0o600)
		const liste = JSON.parse(readFileSync(fichier, 'utf8')) as CaseToReview[]
		expect(liste.map(({ profil }) => profil)).toEqual([26, 28])
		expect(readFileSync(fichier, 'utf8')).not.toMatch(/France|Pinceaux/)
	}, 60_000)

	test('hors ligne, une réponse qui manque arrête la commande avant toute écriture', async () => {
		const avant = await profils()
		const empreinte = (await empreinteDeLaSource()).empreinte
		const partiel = path.join(dossier, 'partiel.json')
		const reponses = JSON.parse(readFileSync(FICHIER_DU_REFERENTIEL_DU_BANC, 'utf8'))
		delete reponses.reponses['nom:lyon']
		writeFileSync(partiel, JSON.stringify(reponses))

		const decisions = ['--decisions', FICHIER_DES_DECISIONS_DU_BANC]
		const manque = await commandeDImport(['--real', ...decisions, '--cities', partiel, '--offline'])
		const absent = await commandeDImport([
			'--real',
			...decisions,
			'--cities',
			path.join(dossier, 'absent.json'),
			'--offline',
		])

		expect(manque.code, manque.sortie).toBe(1)
		expect(manque.sortie).toContain('Hors ligne (--offline), une réponse du référentiel des communes')
		expect(absent.code, absent.sortie).toBe(1)
		expect(absent.sortie).toContain('le fichier des réponses gardées du référentiel des communes n’existe pas')
		expect(await profils()).toEqual(avant)
		expect((await empreinteDeLaSource()).empreinte).toBe(empreinte)
	}, 60_000)
})

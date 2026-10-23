import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import type { Field, Payload } from 'payload'
import { Profiles } from '@/collections/Profiles'
import { DemoDataRefused, demoTarget, SITE_ORIGIN } from '@/demo-data/guard'
import { placeDemoProfiles, requireDemoTarget } from '@/demo-data/loading'
import {
	DEMO_CONSENT,
	DEMO_LENGTHS,
	DEMO_PHOTOS,
	DEMO_PROFILES,
	DEMO_ZONE_PROFILES,
	type DemoProfile,
	LOADED_DEMO_PROFILES,
	PHOTO_MAX_WEIGHT,
	profileUrl,
} from '@/demo-data/profiles'
import { DEPLOYED_ORIGINS } from '@/lib/env'
import { GALLERY_MAX } from '@/lib/media'
import { DESCRIPTION_MAX_LENGTH, NAME_MAX_LENGTH } from '@/lib/profile/lists'
import { profileState, statusAfter } from '@/lib/profile/state'
import { RADIUS_BOUNDS_KM } from '@/lib/profile/zone'
import { slugify } from '@/lib/slug'
import { benchEnvironment, ROOT } from '../support/bench'

/**
 * The fictional set of the bench (ticket 051), without the bench: its
 * twelve profile types, the state the single rule gives each one, its six photos, and the guard
 * that keeps it off the site. The same set loaded on the bench: tests/integration/bench-profile-types.test.ts.
 */

const PHOTO_FOLDER = path.join(ROOT, 'src/demo-data/photos')

const type = (cle: string): DemoProfile => {
	const found = DEMO_PROFILES.find(profil => profil.cle === cle)
	if (!found) throw new Error(`pas de profil type « ${cle} »`)
	return found
}

const zoneType = (cle: string): DemoProfile => {
	const found = DEMO_ZONE_PROFILES.find(profil => profil.cle === cle)
	if (!found) throw new Error(`pas de profil type de zone « ${cle} »`)
	return found
}

/** The state the single rule gives a profile of the set, its photos counted as the server counts them. */
function statePerRule({ profil: profile, photos }: DemoProfile) {
	const document = {
		...profile,
		mainPicture: photos.principale === null ? null : 1,
		gallery: photos.galerie.map((_, rang) => rang + 2),
	}
	const state = profileState(document)
	return { ...state, status: statusAfter({ apres: profile, fullyEmpty: state.fullyEmpty }).status }
}

/** The bench of `.env.test`, default instance. */
const BENCH = benchEnvironment({ nom: 'my-makeup-test', decalage: 0 })

// What the retired pre-production used to give: the guard must refuse it now (ticket 232).
const OLD_PREPROD = {
	APP_ENV: 'preprod',
	NEXT_PUBLIC_SITE_URL: 'https://preprod.my-makeup.fr',
	DATABASE_URI: 'postgres://preprod:secret-de-preprod-factice@base-preprod.interne:5432/mymakeup',
	S3_ENDPOINT: 'https://compte-factice.r2.cloudflarestorage.com',
	S3_BUCKET: 'mymakeup-preprod',
}

const refusal = (essai: () => unknown): string => {
	try {
		essai()
	} catch (error) {
		if (error instanceof DemoDataRefused) return error.message
		throw error
	}
	throw new Error('rien n’a été refusé')
}

describe('Les cinq profils types des zones (tickets 258 à 260)', () => {
	test('ils suivent les douze, avec leurs maquilleuses fictives et leurs slugs', () => {
		expect(DEMO_ZONE_PROFILES.map(({ numero }) => numero)).toEqual([13, 14, 15, 16, 17])
		expect(LOADED_DEMO_PROFILES).toHaveLength(17)
		expect(new Set(LOADED_DEMO_PROFILES.map(({ cle: key }) => key)).size).toBe(17)
		expect(new Set(LOADED_DEMO_PROFILES.map(({ compte: account }) => account.nom)).size).toBe(17)
		for (const { cle: key, compte: account, attendu: expected } of DEMO_ZONE_PROFILES) {
			expect(account.email).toBe(profileUrl(key))
			expect(slugify(account.nom)).toBe(expected.slug)
		}
	})

	test('l’état attendu de chacun est celui de la règle unique', () => {
		for (const profile of DEMO_ZONE_PROFILES) {
			const { slug: _slug, ...expected } = profile.attendu
			expect({ cle: profile.cle, etat: statePerRule(profile) }).toEqual({ cle: profile.cle, etat: expected })
		}
	})

	test('les communes du jeu portent leurs codes postaux ; deux communes fictives partagent le leur', () => {
		for (const profile of DEMO_PROFILES) {
			const city = profile.profil.city
			if (city?.name) expect(city.postalCodes?.length, profile.cle).toBeGreaterThan(0)
		}
		const a = zoneType('code-postal-partage-a').profil.city
		const b = zoneType('code-postal-partage-b').profil.city
		expect(a?.inseeCode).not.toBe(b?.inseeCode)
		expect(a?.postalCodes).toEqual(b?.postalCodes)
		expect(a?.postalCodes).toHaveLength(1)
	})

	test('une zone [BE] avec une ville, une zone [FR, IT], une revue de code postal partagé', () => {
		expect(zoneType('zone-belgique').profil).toMatchObject({
			zoneKind: 'countries',
			countries: ['BE'],
			town: 'Bruxelles',
		})
		expect(zoneType('zone-belgique').attendu.publishable).toBe(true)
		expect(zoneType('zone-france-italie').profil).toMatchObject({ zoneKind: 'countries', countries: ['FR', 'IT'] })
		expect(zoneType('zone-france-italie').attendu.publishable).toBe(true)
		const review = zoneType('zone-a-revoir')
		expect(review.profil.zoneReview).toMatchObject({ reason: 'sharedPostalCode', postalCode: '74990' })
		expect(review.profil.zoneReview?.candidates).toHaveLength(2)
		expect(review.attendu.publishable).toBe(false)
	})
})

describe('Les 12 profils types du plan 02 §6', () => {
	test('douze types, dans l’ordre du plan, chacun avec sa maquilleuse fictive en @example.test', () => {
		expect(DEMO_PROFILES.map(({ numero }) => numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
		expect(new Set(DEMO_PROFILES.map(({ cle: key }) => key)).size).toBe(12)
		for (const { cle: key, compte: account } of DEMO_PROFILES) {
			expect(account.email).toBe(profileUrl(key))
			expect(account.email).toMatch(/^jeu-profil-[a-z-]+@example\.test$/)
		}
		expect(new Set(DEMO_PROFILES.map(({ compte: account }) => account.nom)).size).toBe(12)
	})

	test('le slug attendu est celui que la règle tire du nom du compte, sans collision', () => {
		for (const { cle: key, compte: account, attendu: expected } of DEMO_PROFILES)
			expect({ cle: key, slug: slugify(account.nom) }).toEqual({ cle: key, slug: expected.slug })
		expect(new Set(DEMO_PROFILES.map(({ attendu: expected }) => expected.slug)).size).toBe(12)
		// The examples of the frozen URL table (ticket 033) name this profile.
		expect(type('ancien-nom-accentue').attendu.slug).toBe('zoe-lefevre')
		expect(type('ancien-nom-accentue').profil.legacyUsername).toBe('zoé lefèvre')
	})

	test('l’état attendu de chaque type est celui de la règle unique', () => {
		for (const profile of DEMO_PROFILES) {
			const { slug: _slug, ...expected } = profile.attendu
			expect({ cle: profile.cle, etat: statePerRule(profile) }).toEqual({ cle: profile.cle, etat: expected })
		}
	})

	test('la référence est publiable et publiée ; le profil vide n’est ni actif ni publiable, et reste en brouillon', () => {
		expect(type('reference').attendu).toMatchObject({
			publishable: true,
			active: true,
			status: 'published',
			completeness: 13,
		})
		expect(type('vide').attendu).toMatchObject({
			active: false,
			publishable: false,
			fullyEmpty: true,
			status: 'draft',
			completeness: 0,
		})
		expect(type('vide').profil).toEqual({})
		expect(type('vide').photos).toEqual({ principale: null, galerie: [] })
	})

	test('la référence publie son téléphone et son email ; tous les numéros sont de la plage de la fiction', () => {
		const reference = type('reference').profil

		expect(reference.publicContact).toBe(true)
		expect(reference.contactDetails?.phone).toBe('06 39 98 10 01')
		expect(reference.contactDetails?.email).toEndWith('.example.test')
		expect(reference.consentedAt).toBe(DEMO_CONSENT)
		expect(reference.consentSource).toBe('artist')
		expect(type('reference').photos.galerie).toHaveLength(6)
		expect(reference.serviceOffers?.filter(({ priceFrom }) => typeof priceFrom === 'number')).toHaveLength(3)
		for (const { profil: profile } of DEMO_PROFILES) {
			const phone = profile.contactDetails?.phone
			if (phone) expect(phone).toMatch(/^(?:0|\+33 \(0\))6 39 98 /)
			const email = profile.contactDetails?.email
			if (email) expect(email).toMatch(/[@.]example\.test$/)
			for (const link of Object.values(profile.networks ?? {}))
				if (link) expect(new URL(link).hostname).toEndWith('.example.test')
		}
	})

	test('chaque cas a sa différence, et une seule : disponibilité, ville, contact, statut choisi, vérification', () => {
		expect(type('indisponible').profil.available).toBe(false)
		expect(type('disponibilite-inconnue').profil.available).toBeNull()
		expect(type('ville-voisine').profil.city?.name).toBe('Annemasse')
		expect(type('ville-eloignee').profil.city?.name).toBe('Nantes')
		expect(type('reference').profil.city?.name).toBe('Annecy')
		expect(type('sans-contact-public').profil.publicContact).toBe(false)
		expect(type('sans-contact-public').profil.networks).toEqual({})
		expect(type('masquee').profil.chosenStatus).toBe('hidden')
		expect(type('verifiee').profil).toMatchObject({ verified: true, superArtist: true })
		// The status is chosen for the hidden profile only: every other one follows the rule (ticket 044).
		const picked = DEMO_PROFILES.filter(({ profil: profile }) => profile.chosenStatus !== undefined).map(
			({ cle: key }) => key
		)
		expect(picked).toEqual(['masquee'])
		for (const { profil: profile } of DEMO_PROFILES) expect('status' in profile).toBe(false)
	})

	test('le profil aux textes maximaux porte chaque texte à la borne du serveur', () => {
		const { profil: profile, photos } = type('textes-maximaux')
		const bound = (nom: string): number => {
			const field = Profiles.fields.find((field: Field) => 'name' in field && field.name === nom)
			return field && 'maxLength' in field && typeof field.maxLength === 'number' ? field.maxLength : Number.NaN
		}

		for (const name of ['firstName', 'lastName', 'artistName', 'specialty', 'description'] as const)
			expect({ nom: name, longueur: profile[name]?.length }).toEqual({ nom: name, longueur: bound(name) })
		expect(profile.radiusKm).toBe(RADIUS_BOUNDS_KM.max)
		expect(photos.galerie).toHaveLength(GALLERY_MAX)
		for (const serviceOffer of profile.serviceOffers ?? []) {
			expect([serviceOffer.name?.length, serviceOffer.priceText?.length]).toEqual([NAME_MAX_LENGTH, NAME_MAX_LENGTH])
			expect(serviceOffer.description?.length).toBe(DESCRIPTION_MAX_LENGTH)
			for (const option of serviceOffer.options ?? [])
				expect([option.name?.length, option.priceText?.length, option.description?.length]).toEqual([
					NAME_MAX_LENGTH,
					NAME_MAX_LENGTH,
					DESCRIPTION_MAX_LENGTH,
				])
		}
		for (const link of Object.values(profile.networks ?? {})) expect(link?.length).toBe(200)
		for (const { valeur: value, maximum } of Object.values(DEMO_LENGTHS)) expect(value.length).toBe(maximum)
		expect(profile.contactDetails).toEqual({
			phone: DEMO_LENGTHS.telephone.valeur,
			email: DEMO_LENGTHS.email.valeur,
		})
		// The longest slug: the name of the account is cut at 70 characters.
		expect(type('textes-maximaux').attendu.slug).toHaveLength(70)
	})
})

describe('Les six photos du jeu', () => {
	test('six fichiers WebP de moins de 30 Ko, sans métadonnées, et rien d’autre dans le dossier', () => {
		expect(readdirSync(PHOTO_FOLDER).sort()).toEqual([...DEMO_PHOTOS])
		for (const photo of DEMO_PHOTOS) {
			const filePath = path.join(PHOTO_FOLDER, photo)
			const bytes = readFileSync(filePath)

			expect({ photo, poids: statSync(filePath).size < PHOTO_MAX_WEIGHT }).toEqual({ photo, poids: true })
			expect(bytes.subarray(0, 4).toString('latin1')).toBe('RIFF')
			expect(bytes.subarray(8, 12).toString('latin1')).toBe('WEBP')
			// The simple format, a lossy image and nothing else: no EXIF, XMP nor ICC chunk can follow.
			expect(bytes.subarray(12, 16).toString('latin1')).toBe('VP8 ')
		}
		expect(PHOTO_MAX_WEIGHT).toBe(30_000)
	})

	test('chaque photo sert à un profil au moins, et chaque profil ne montre que des photos du jeu', () => {
		const servedList = new Set(DEMO_PROFILES.flatMap(({ photos }) => [photos.principale, ...photos.galerie]))

		for (const photo of DEMO_PHOTOS) expect(servedList.has(photo)).toBe(true)
		for (const served of servedList) if (served !== null) expect(DEMO_PHOTOS).toContain(served)
		for (const { photos } of DEMO_PROFILES) expect(photos.galerie.length).toBeLessThanOrEqual(GALLERY_MAX)
	})
})

describe('Le jeu ne se charge que sur le banc', () => {
	test('la seule adresse déployée que connaît l’application est celle du site', () => {
		expect(DEPLOYED_ORIGINS).toEqual([SITE_ORIGIN])
	})

	test('le banc de test est accepté, quelle que soit son instance', () => {
		expect(demoTarget(BENCH)).toBe('banc')
		expect(demoTarget(benchEnvironment({ nom: 'mm-051', decalage: 451 }))).toBe('banc')
	})

	test.each([
		['la prod déclarée', { ...BENCH, APP_ENV: 'prod' }, 'APP_ENV vaut « prod »'],
		[
			'l’ancienne préprod : plus aucune garde ne l’accepte, avec ou sans stockage d’objets',
			OLD_PREPROD,
			'APP_ENV n’est pas « test »',
		],
		[
			'l’ancienne préprod sans stockage',
			{ ...OLD_PREPROD, S3_ENDPOINT: undefined, S3_BUCKET: undefined },
			'APP_ENV n’est pas « test »',
		],
		[
			'l’adresse du site en ligne, même déclarée préprod',
			{ ...OLD_PREPROD, NEXT_PUBLIC_SITE_URL: SITE_ORIGIN },
			'site en ligne',
		],
		['l’adresse du site en ligne sur le banc', { ...BENCH, NEXT_PUBLIC_SITE_URL: SITE_ORIGIN }, 'site en ligne'],
		['un environnement sans APP_ENV (un .env de développement)', { ...BENCH, APP_ENV: undefined }, 'APP_ENV manque'],
		['un APP_ENV inconnu', { ...BENCH, APP_ENV: 'staging' }, 'APP_ENV n’est pas « test »'],
		[
			'la base de développement du poste',
			{ ...BENCH, DATABASE_URI: 'postgres://mymakeup:local-dev-only@127.0.0.1:5442/mymakeup_dev' },
			'DATABASE_URI',
		],
		[
			'une base distante, même nommée en _test',
			{ ...BENCH, DATABASE_URI: 'postgres://banc:mot-de-passe-factice@db.example.test:5432/mymakeup_test' },
			'DATABASE_URI',
		],
		[
			'une base locale dont l’hôte est remplacé par un paramètre',
			{ ...BENCH, DATABASE_URI: `${BENCH.DATABASE_URI}?host=db.example.test` },
			'DATABASE_URI',
		],
		['sans base', { ...BENCH, DATABASE_URI: undefined }, 'DATABASE_URI manque'],
		['sans stockage d’objets', { ...BENCH, S3_ENDPOINT: undefined }, 'S3_ENDPOINT manque'],
		[
			'un stockage distant sur le banc',
			{ ...BENCH, S3_ENDPOINT: 'https://compte-factice.r2.cloudflarestorage.com' },
			'S3_ENDPOINT',
		],
		['un espace qui n’est pas celui d’un banc', { ...BENCH, S3_BUCKET: 'mymakeup' }, 'S3_BUCKET'],
		[
			'l’adresse de l’ancienne préprod sur le banc',
			{ ...BENCH, NEXT_PUBLIC_SITE_URL: OLD_PREPROD.NEXT_PUBLIC_SITE_URL },
			'NEXT_PUBLIC_SITE_URL',
		],
	])('refusé : %s', (_cas, variables, motif) => {
		const message = refusal(() => demoTarget(variables))

		expect(message).toStartWith('Jeu fictif refusé : ')
		expect(message).toContain(motif)
		expect(message).toEndWith('Rien n’est lu ni écrit.')
		// The variable is named, never its value.
		for (const secret of [
			'mot-de-passe-factice',
			'local-dev-only',
			'secret-de-preprod-factice',
			'db.example.test',
			'staging',
		])
			expect(message).not.toContain(secret)
	})

	/** A Payload that only remembers what was asked of it: no connection is opened, every call is recorded. */
	function fakePayload(connexion: string | undefined) {
		const calls: string[] = []
		const note = (operation: string) => () => {
			calls.push(operation)
			return Promise.reject(new Error(`${operation} ne devait pas être appelé`))
		}
		const payload = {
			config: {},
			create: note('create'),
			db: { poolOptions: { connectionString: connexion } },
			find: note('find'),
			update: note('update'),
		} as unknown as Payload
		return { appels: calls, payload }
	}

	test('hors du banc, le chargement s’arrête avant de lire ou d’écrire quoi que ce soit', async () => {
		const { appels: calls, payload } = fakePayload(OLD_PREPROD.DATABASE_URI)

		await expect(placeDemoProfiles(payload, { variables: { ...OLD_PREPROD, APP_ENV: 'prod' } })).rejects.toBeInstanceOf(
			DemoDataRefused
		)
		expect(calls).toEqual([])
	})

	test('quand Payload est branché ailleurs que l’environnement ne le dit, rien n’est lu ni écrit', async () => {
		const { appels: calls, payload } = fakePayload('postgres://mymakeup:local-dev-only@127.0.0.1:5442/mymakeup_dev')

		expect(refusal(() => requireDemoTarget(payload, BENCH))).toContain(
			'Payload n’est pas branché sur la base que DATABASE_URI désigne.'
		)
		await expect(placeDemoProfiles(payload, { variables: BENCH })).rejects.toBeInstanceOf(DemoDataRefused)
		expect(calls).toEqual([])
	})

	test('sur le banc, le chargement passe la garde et commence par chercher le compte du premier type', async () => {
		// The witness of the two tests above: the same fake Payload, connected to the bench, goes on
		// to its first read, which it refuses.
		const { appels: calls, payload } = fakePayload(BENCH.DATABASE_URI)

		await expect(placeDemoProfiles(payload, { variables: BENCH })).rejects.toThrow('find ne devait pas être appelé')
		expect(calls).toEqual(['find'])
	})
})

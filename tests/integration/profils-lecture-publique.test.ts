import { afterEach, describe, expect, test } from 'bun:test'
import type { StatutDuProfil } from '@/lib/profil/statut'
import type { Profile } from '@/payload-types'
import { creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { appelerRest } from '../outils/rest'

/**
 * What the public reads of the profiles, and what only an admin writes on them (ticket 021; plan
 * 02 §7.3, I01 and I03; U53 and U55 through the real API).
 */

afterEach(viderLaBase)

/** What an admin decided about a profile, and what the import wrote: none of it is public. */
const RESERVE = {
	motif: 'Motif fictif du masquage',
	verifie: true,
	verifieLe: '2026-10-01T00:00:00.000Z',
	siret: '12345678901234',
	noteInterne: 'Note interne fictive',
	score: 7.5,
	legacyUsername: 'Ancien Pseudo Fictif',
	strapiId: 4242,
} as const

/**
 * What anyone but the owner and an admin reads of a published profile: its identity, its networks
 * (ticket 042), its photos (ticket 043), its lists (ticket 040), its zone (ticket 041), its state (ticket 044), the badge
 * of the search and Payload's dates. A new public field of the profile is added here on purpose.
 */
const CLES_PUBLIQUES = [
	'aDomicile',
	'actif',
	'commune',
	'competences',
	'completude',
	'createdAt',
	'description',
	'disponible',
	'entierementVide',
	'experiences',
	'formations',
	'galerie',
	'id',
	'langues',
	'nom',
	'nomArtiste',
	'photoPrincipale',
	'prenom',
	'prestations',
	'publiable',
	'rayonKm',
	'reseaux',
	'slug',
	'specialite',
	'superMaquilleuse',
	'updatedAt',
]

/** The identifier of the old site is unique: each profile of a test gets its own. */
let dernierStrapiId: number = RESERVE.strapiId

/** The account of a makeup artist, with her profile in this status and every reserved field filled. */
async function maquilleuseAvecProfil(statut: StatutDuProfil) {
	const compte = await creerCompte('maquilleuse')
	const payload = await payloadDeTest()
	const [profil] = (await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } }))
		.docs
	if (!profil) throw new Error('La fabrique n’a pas créé de profil.')
	dernierStrapiId += 1
	const rempli = await payload.update({
		collection: 'profiles',
		id: profil.id,
		data: { ...RESERVE, strapiId: dernierStrapiId, statut, prenom: 'Prénom', nom: 'Fictif', superMaquilleuse: true },
	})
	return { compte, profil: rempli }
}

/** The profile as the database holds it, read without access control. */
async function stocke(id: number): Promise<Profile> {
	const payload = await payloadDeTest()
	return payload.findByID({ collection: 'profiles', id, depth: 0 })
}

const identifiants = (corps: unknown) => (corps as { docs: { id: number }[] }).docs.map(({ id }) => id)

describe('Lecture anonyme : seuls les profils publiés sortent (I01, U53)', () => {
	test('par REST et par l’API locale, un profil publié sur trois', async () => {
		const [publie, brouillon, masque] = await Promise.all([
			maquilleuseAvecProfil('publie'),
			maquilleuseAvecProfil('brouillon'),
			maquilleuseAvecProfil('masque'),
		])
		const payload = await payloadDeTest()

		const rest = await appelerRest('GET', '/api/profiles?limit=100&depth=0')
		const locale = await payload.find({ collection: 'profiles', depth: 0, overrideAccess: false })

		expect(rest.statut).toBe(200)
		expect(identifiants(rest.corps)).toEqual([publie.profil.id])
		expect(locale.docs.map(({ id }) => id)).toEqual([publie.profil.id])
		for (const cache of [brouillon, masque])
			expect((await appelerRest('GET', `/api/profiles/${cache.profil.id}`)).statut).toBe(404)
	})
})

describe('Instantané des clés : aucun champ réservé, ni compte relié, ni strapiId', () => {
	test('un profil publié lu par un anonyme, à toutes les profondeurs, en liste et seul', async () => {
		const { profil } = await maquilleuseAvecProfil('publie')

		for (const chemin of [
			`/api/profiles/${profil.id}?depth=0`,
			`/api/profiles/${profil.id}?depth=2`,
			'/api/profiles?depth=1',
		]) {
			const { statut, corps, texte } = await appelerRest('GET', chemin)
			expect(statut).toBe(200)
			const document = 'docs' in (corps as object) ? (corps as { docs: object[] }).docs[0] : corps
			expect(Object.keys(document as object).sort()).toEqual(CLES_PUBLIQUES)
			for (const valeur of [RESERVE.noteInterne, RESERVE.siret, RESERVE.motif, RESERVE.legacyUsername])
				expect(texte).not.toContain(valeur)
		}
	})

	test('lu par une autre maquilleuse ou par redaction : les mêmes clés', async () => {
		const { profil } = await maquilleuseAvecProfil('publie')
		const [autre, redaction] = await Promise.all([creerCompte('maquilleuse'), creerCompte('redaction')])

		for (const lecteur of [autre, redaction]) {
			const { statut, corps } = await appelerRest('GET', `/api/profiles/${profil.id}?depth=0`, {
				enTetes: lecteur.session.enTetes,
			})
			expect(statut).toBe(200)
			expect(Object.keys(corps as object).sort()).toEqual(CLES_PUBLIQUES)
		}
	})

	test('la propriétaire lit son statut, son motif, sa vérification et son SIRET, jamais la note interne ni le score', async () => {
		const { compte, profil } = await maquilleuseAvecProfil('masque')

		const { statut, corps } = await appelerRest('GET', `/api/profiles/${profil.id}?depth=0`, {
			enTetes: compte.session.enTetes,
		})

		expect(statut).toBe(200)
		expect(corps).toMatchObject({
			statut: 'masque',
			motif: RESERVE.motif,
			verifie: true,
			verifieLe: RESERVE.verifieLe,
			siret: RESERVE.siret,
			pro: Number(compte.id),
			legacyUsername: RESERVE.legacyUsername,
			strapiId: profil.strapiId,
		})
		expect(corps).not.toHaveProperty('noteInterne')
		expect(corps).not.toHaveProperty('score')
	})

	test('l’admin lit tout', async () => {
		const { profil } = await maquilleuseAvecProfil('publie')
		const admin = await creerCompte('admin')

		const { corps } = await appelerRest('GET', `/api/profiles/${profil.id}?depth=0`, { enTetes: admin.session.enTetes })

		expect(corps).toMatchObject({ ...RESERVE, strapiId: profil.strapiId, statut: 'publie', superMaquilleuse: true })
	})
})

describe('Statut, vérifié et score envoyés par la maquilleuse restent inchangés (I03, U55)', () => {
	test('la modification passe pour son identité, les champs réservés gardent leur valeur', async () => {
		const { compte, profil } = await maquilleuseAvecProfil('brouillon')
		const autre = await creerCompte('maquilleuse-sans-profil')
		const avant = await stocke(profil.id)

		const { statut } = await appelerRest('PATCH', `/api/profiles/${profil.id}`, {
			enTetes: compte.session.enTetes,
			corps: {
				prenom: 'Nouveau Prénom',
				statut: 'publie',
				verifie: false,
				verifieLe: '2026-10-14T00:00:00.000Z',
				score: 99,
				motif: 'Envoyé par la maquilleuse',
				siret: '98765432109876',
				noteInterne: 'Envoyée par la maquilleuse',
				superMaquilleuse: false,
				pro: Number(autre.id),
			},
		})

		expect(statut).toBe(200)
		const apres = await stocke(profil.id)
		expect(apres.prenom).toBe('Nouveau Prénom')
		const reserves = [
			'statut',
			'verifie',
			'verifieLe',
			'score',
			'motif',
			'siret',
			'noteInterne',
			'superMaquilleuse',
			'pro',
		] as const
		for (const champ of reserves) expect([champ, apres[champ]]).toEqual([champ, avant[champ]])
	})

	test('un SIRET mal formé est refusé en français, même pour un admin', async () => {
		const { profil } = await maquilleuseAvecProfil('publie')
		const admin = await creerCompte('admin')

		const { statut, texte } = await appelerRest('PATCH', `/api/profiles/${profil.id}`, {
			enTetes: admin.session.enTetes,
			corps: { siret: '123 456 789' },
		})

		expect(statut).toBe(400)
		expect(texte).toContain('Le SIRET compte 14 chiffres, sans espace.')
		expect((await stocke(profil.id)).siret).toBe(RESERVE.siret)
	})
})

describe('L’admin masque un profil : la lecture anonyme suivante ne le rend plus', () => {
	test('lu par son identifiant et dans la liste avant ; introuvable et absent de la liste après', async () => {
		const { profil } = await maquilleuseAvecProfil('publie')
		const admin = await creerCompte('admin')
		expect((await appelerRest('GET', `/api/profiles/${profil.id}`)).statut).toBe(200)

		const masquage = await appelerRest('PATCH', `/api/profiles/${profil.id}`, {
			enTetes: admin.session.enTetes,
			corps: { statutChoisi: 'masque', motif: 'Masqué pour le test' },
		})

		expect(masquage.statut).toBe(200)
		expect((await appelerRest('GET', `/api/profiles/${profil.id}`)).statut).toBe(404)
		expect(identifiants((await appelerRest('GET', '/api/profiles?depth=0')).corps)).toEqual([])
	})
})

/** Addresses a robot tries: none names an identifier a profile or a media can have. */
const IDENTIFIANTS_MAL_FORMES = ['abc', 'wp-login.php', '1e999', '99999999999', '1.5']

describe('Un identifiant de profil mal formé : refusé avant la base, jamais une erreur 500', () => {
	test('par REST pour l’anonyme, une maquilleuse et l’admin ; par l’API locale avec les règles actives', async () => {
		const [maquilleuse, admin] = await Promise.all([creerCompte('maquilleuse'), creerCompte('admin')])
		const payload = await payloadDeTest()

		for (const enTetes of [{}, maquilleuse.session.enTetes, admin.session.enTetes])
			for (const id of IDENTIFIANTS_MAL_FORMES)
				expect([id, (await appelerRest('GET', `/api/profiles/${id}`, { enTetes })).statut]).toEqual([id, 403])
		for (const id of IDENTIFIANTS_MAL_FORMES)
			await expect(payload.findByID({ collection: 'profiles', id, overrideAccess: false })).rejects.toMatchObject({
				status: 403,
			})
	})
})

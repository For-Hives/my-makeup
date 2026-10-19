import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import type { Field, Payload } from 'payload'
import { Profils } from '@/collections/Profiles'
import { exigerLaCibleDuJeu, poserLesProfilsDuJeu } from '@/jeu-fictif/chargement'
import { cibleDuJeu, JeuFictifRefuse, ORIGINE_DU_SITE } from '@/jeu-fictif/garde'
import {
	adresseDuProfil,
	CONSENTEMENT_DU_JEU,
	LONGUEURS_DU_JEU,
	PHOTOS_DU_JEU,
	POIDS_MAX_D_UNE_PHOTO,
	PROFILS_DU_JEU,
	type ProfilDuJeu,
} from '@/jeu-fictif/profils'
import { DEPLOYED_ORIGINS } from '@/lib/env'
import { GALERIE_MAX } from '@/lib/medias'
import { etatDuProfil, statutApres } from '@/lib/profil/etat'
import { LONGUEUR_DESCRIPTION, LONGUEUR_NOM } from '@/lib/profil/listes'
import { BORNES_DU_RAYON_KM } from '@/lib/profil/zone'
import { slugifier } from '@/lib/slug'
import { environnementDuBanc, RACINE } from '../outils/banc'

/**
 * The fictional set of the bench (ticket 051), without the bench: its
 * twelve profile types, the state the single rule gives each one, its six photos, and the guard
 * that keeps it off the site. The same set loaded on the bench: tests/integration/banc-profils-types.test.ts.
 */

const DOSSIER_DES_PHOTOS = path.join(RACINE, 'src/jeu-fictif/photos')

const type = (cle: string): ProfilDuJeu => {
	const trouve = PROFILS_DU_JEU.find(profil => profil.cle === cle)
	if (!trouve) throw new Error(`pas de profil type « ${cle} »`)
	return trouve
}

/** The state the single rule gives a profile of the set, its photos counted as the server counts them. */
function etatSelonLaRegle({ profil, photos }: ProfilDuJeu) {
	const document = {
		...profil,
		photoPrincipale: photos.principale === null ? null : 1,
		galerie: photos.galerie.map((_, rang) => rang + 2),
	}
	const etat = etatDuProfil(document)
	return { ...etat, statut: statutApres({ apres: profil, entierementVide: etat.entierementVide }).statut }
}

/** The bench of `.env.test`, default instance. */
const BANC = environnementDuBanc({ nom: 'my-makeup-test', decalage: 0 })

// What the retired pre-production used to give: the guard must refuse it now (ticket 232).
const ANCIENNE_PREPROD = {
	APP_ENV: 'preprod',
	NEXT_PUBLIC_SITE_URL: 'https://preprod.my-makeup.fr',
	DATABASE_URI: 'postgres://preprod:secret-de-preprod-factice@base-preprod.interne:5432/mymakeup',
	S3_ENDPOINT: 'https://compte-factice.r2.cloudflarestorage.com',
	S3_BUCKET: 'mymakeup-preprod',
}

const refus = (essai: () => unknown): string => {
	try {
		essai()
	} catch (erreur) {
		if (erreur instanceof JeuFictifRefuse) return erreur.message
		throw erreur
	}
	throw new Error('rien n’a été refusé')
}

describe('Les 12 profils types du plan 02 §6', () => {
	test('douze types, dans l’ordre du plan, chacun avec sa maquilleuse fictive en @example.test', () => {
		expect(PROFILS_DU_JEU.map(({ numero }) => numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
		expect(new Set(PROFILS_DU_JEU.map(({ cle }) => cle)).size).toBe(12)
		for (const { cle, compte } of PROFILS_DU_JEU) {
			expect(compte.email).toBe(adresseDuProfil(cle))
			expect(compte.email).toMatch(/^jeu-profil-[a-z-]+@example\.test$/)
		}
		expect(new Set(PROFILS_DU_JEU.map(({ compte }) => compte.nom)).size).toBe(12)
	})

	test('le slug attendu est celui que la règle tire du nom du compte, sans collision', () => {
		for (const { cle, compte, attendu } of PROFILS_DU_JEU)
			expect({ cle, slug: slugifier(compte.nom) }).toEqual({ cle, slug: attendu.slug })
		expect(new Set(PROFILS_DU_JEU.map(({ attendu }) => attendu.slug)).size).toBe(12)
		// The examples of the frozen URL table (ticket 033) name this profile.
		expect(type('ancien-nom-accentue').attendu.slug).toBe('zoe-lefevre')
		expect(type('ancien-nom-accentue').profil.legacyUsername).toBe('zoé lefèvre')
	})

	test('l’état attendu de chaque type est celui de la règle unique', () => {
		for (const profil of PROFILS_DU_JEU) {
			const { slug: _slug, ...attendu } = profil.attendu
			expect({ cle: profil.cle, etat: etatSelonLaRegle(profil) }).toEqual({ cle: profil.cle, etat: attendu })
		}
	})

	test('la référence est publiable et publiée ; le profil vide n’est ni actif ni publiable, et reste en brouillon', () => {
		expect(type('reference').attendu).toMatchObject({ publiable: true, actif: true, statut: 'publie', completude: 13 })
		expect(type('vide').attendu).toMatchObject({
			actif: false,
			publiable: false,
			entierementVide: true,
			statut: 'brouillon',
			completude: 0,
		})
		expect(type('vide').profil).toEqual({})
		expect(type('vide').photos).toEqual({ principale: null, galerie: [] })
	})

	test('la référence publie son téléphone et son email ; tous les numéros sont de la plage de la fiction', () => {
		const reference = type('reference').profil

		expect(reference.contactPublic).toBe(true)
		expect(reference.coordonnees?.telephone).toBe('06 39 98 10 01')
		expect(reference.coordonnees?.email).toEndWith('.example.test')
		expect(reference.consentiLe).toBe(CONSENTEMENT_DU_JEU)
		expect(reference.sourceConsentement).toBe('maquilleuse')
		expect(type('reference').photos.galerie).toHaveLength(6)
		expect(reference.prestations?.filter(({ prixAPartirDe }) => typeof prixAPartirDe === 'number')).toHaveLength(3)
		for (const { profil } of PROFILS_DU_JEU) {
			const telephone = profil.coordonnees?.telephone
			if (telephone) expect(telephone).toMatch(/^(?:0|\+33 \(0\))6 39 98 /)
			const email = profil.coordonnees?.email
			if (email) expect(email).toMatch(/[@.]example\.test$/)
			for (const lien of Object.values(profil.reseaux ?? {}))
				if (lien) expect(new URL(lien).hostname).toEndWith('.example.test')
		}
	})

	test('chaque cas a sa différence, et une seule : disponibilité, ville, contact, statut choisi, vérification', () => {
		expect(type('indisponible').profil.disponible).toBe(false)
		expect(type('disponibilite-inconnue').profil.disponible).toBeNull()
		expect(type('ville-voisine').profil.commune?.nom).toBe('Annemasse')
		expect(type('ville-eloignee').profil.commune?.nom).toBe('Nantes')
		expect(type('reference').profil.commune?.nom).toBe('Annecy')
		expect(type('sans-contact-public').profil.contactPublic).toBe(false)
		expect(type('sans-contact-public').profil.reseaux).toEqual({})
		expect(type('masquee').profil.statutChoisi).toBe('masque')
		expect(type('verifiee').profil).toMatchObject({ verifie: true, superMaquilleuse: true })
		// The status is chosen for the hidden profile only: every other one follows the rule (ticket 044).
		const choisis = PROFILS_DU_JEU.filter(({ profil }) => profil.statutChoisi !== undefined).map(({ cle }) => cle)
		expect(choisis).toEqual(['masquee'])
		for (const { profil } of PROFILS_DU_JEU) expect('statut' in profil).toBe(false)
	})

	test('le profil aux textes maximaux porte chaque texte à la borne du serveur', () => {
		const { profil, photos } = type('textes-maximaux')
		const borne = (nom: string): number => {
			const champ = Profils.fields.find((field: Field) => 'name' in field && field.name === nom)
			return champ && 'maxLength' in champ && typeof champ.maxLength === 'number' ? champ.maxLength : Number.NaN
		}

		for (const nom of ['prenom', 'nom', 'nomArtiste', 'specialite', 'description'] as const)
			expect({ nom, longueur: profil[nom]?.length }).toEqual({ nom, longueur: borne(nom) })
		expect(profil.rayonKm).toBe(BORNES_DU_RAYON_KM.max)
		expect(photos.galerie).toHaveLength(GALERIE_MAX)
		for (const prestation of profil.prestations ?? []) {
			expect([prestation.nom?.length, prestation.prixTexte?.length]).toEqual([LONGUEUR_NOM, LONGUEUR_NOM])
			expect(prestation.description?.length).toBe(LONGUEUR_DESCRIPTION)
			for (const option of prestation.options ?? [])
				expect([option.nom?.length, option.prixTexte?.length, option.description?.length]).toEqual([
					LONGUEUR_NOM,
					LONGUEUR_NOM,
					LONGUEUR_DESCRIPTION,
				])
		}
		for (const lien of Object.values(profil.reseaux ?? {})) expect(lien?.length).toBe(200)
		for (const { valeur, maximum } of Object.values(LONGUEURS_DU_JEU)) expect(valeur.length).toBe(maximum)
		expect(profil.coordonnees).toEqual({
			telephone: LONGUEURS_DU_JEU.telephone.valeur,
			email: LONGUEURS_DU_JEU.email.valeur,
		})
		// The longest slug: the name of the account is cut at 70 characters.
		expect(type('textes-maximaux').attendu.slug).toHaveLength(70)
	})
})

describe('Les six photos du jeu', () => {
	test('six fichiers WebP de moins de 30 Ko, sans métadonnées, et rien d’autre dans le dossier', () => {
		expect(readdirSync(DOSSIER_DES_PHOTOS).sort()).toEqual([...PHOTOS_DU_JEU])
		for (const photo of PHOTOS_DU_JEU) {
			const chemin = path.join(DOSSIER_DES_PHOTOS, photo)
			const octets = readFileSync(chemin)

			expect({ photo, poids: statSync(chemin).size < POIDS_MAX_D_UNE_PHOTO }).toEqual({ photo, poids: true })
			expect(octets.subarray(0, 4).toString('latin1')).toBe('RIFF')
			expect(octets.subarray(8, 12).toString('latin1')).toBe('WEBP')
			// The simple format, a lossy image and nothing else: no EXIF, XMP nor ICC chunk can follow.
			expect(octets.subarray(12, 16).toString('latin1')).toBe('VP8 ')
		}
		expect(POIDS_MAX_D_UNE_PHOTO).toBe(30_000)
	})

	test('chaque photo sert à un profil au moins, et chaque profil ne montre que des photos du jeu', () => {
		const servies = new Set(PROFILS_DU_JEU.flatMap(({ photos }) => [photos.principale, ...photos.galerie]))

		for (const photo of PHOTOS_DU_JEU) expect(servies.has(photo)).toBe(true)
		for (const servie of servies) if (servie !== null) expect(PHOTOS_DU_JEU).toContain(servie)
		for (const { photos } of PROFILS_DU_JEU) expect(photos.galerie.length).toBeLessThanOrEqual(GALERIE_MAX)
	})
})

describe('Le jeu ne se charge que sur le banc', () => {
	test('la seule adresse déployée que connaît l’application est celle du site', () => {
		expect(DEPLOYED_ORIGINS).toEqual([ORIGINE_DU_SITE])
	})

	test('le banc de test est accepté, quelle que soit son instance', () => {
		expect(cibleDuJeu(BANC)).toBe('banc')
		expect(cibleDuJeu(environnementDuBanc({ nom: 'mm-051', decalage: 451 }))).toBe('banc')
	})

	test.each([
		['la prod déclarée', { ...BANC, APP_ENV: 'prod' }, 'APP_ENV vaut « prod »'],
		[
			'l’ancienne préprod : plus aucune garde ne l’accepte, avec ou sans stockage d’objets',
			ANCIENNE_PREPROD,
			'APP_ENV n’est pas « test »',
		],
		[
			'l’ancienne préprod sans stockage',
			{ ...ANCIENNE_PREPROD, S3_ENDPOINT: undefined, S3_BUCKET: undefined },
			'APP_ENV n’est pas « test »',
		],
		[
			'l’adresse du site en ligne, même déclarée préprod',
			{ ...ANCIENNE_PREPROD, NEXT_PUBLIC_SITE_URL: ORIGINE_DU_SITE },
			'site en ligne',
		],
		['l’adresse du site en ligne sur le banc', { ...BANC, NEXT_PUBLIC_SITE_URL: ORIGINE_DU_SITE }, 'site en ligne'],
		['un environnement sans APP_ENV (un .env de développement)', { ...BANC, APP_ENV: undefined }, 'APP_ENV manque'],
		['un APP_ENV inconnu', { ...BANC, APP_ENV: 'staging' }, 'APP_ENV n’est pas « test »'],
		[
			'la base de développement du poste',
			{ ...BANC, DATABASE_URI: 'postgres://mymakeup:local-dev-only@127.0.0.1:5442/mymakeup_dev' },
			'DATABASE_URI',
		],
		[
			'une base distante, même nommée en _test',
			{ ...BANC, DATABASE_URI: 'postgres://banc:mot-de-passe-factice@db.example.test:5432/mymakeup_test' },
			'DATABASE_URI',
		],
		[
			'une base locale dont l’hôte est remplacé par un paramètre',
			{ ...BANC, DATABASE_URI: `${BANC.DATABASE_URI}?host=db.example.test` },
			'DATABASE_URI',
		],
		['sans base', { ...BANC, DATABASE_URI: undefined }, 'DATABASE_URI manque'],
		['sans stockage d’objets', { ...BANC, S3_ENDPOINT: undefined }, 'S3_ENDPOINT manque'],
		[
			'un stockage distant sur le banc',
			{ ...BANC, S3_ENDPOINT: 'https://compte-factice.r2.cloudflarestorage.com' },
			'S3_ENDPOINT',
		],
		['un espace qui n’est pas celui d’un banc', { ...BANC, S3_BUCKET: 'mymakeup' }, 'S3_BUCKET'],
		[
			'l’adresse de l’ancienne préprod sur le banc',
			{ ...BANC, NEXT_PUBLIC_SITE_URL: ANCIENNE_PREPROD.NEXT_PUBLIC_SITE_URL },
			'NEXT_PUBLIC_SITE_URL',
		],
	])('refusé : %s', (_cas, variables, motif) => {
		const message = refus(() => cibleDuJeu(variables))

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
	function fauxPayload(connexion: string | undefined) {
		const appels: string[] = []
		const noter = (operation: string) => () => {
			appels.push(operation)
			return Promise.reject(new Error(`${operation} ne devait pas être appelé`))
		}
		const payload = {
			config: {},
			create: noter('create'),
			db: { poolOptions: { connectionString: connexion } },
			find: noter('find'),
			update: noter('update'),
		} as unknown as Payload
		return { appels, payload }
	}

	test('hors du banc, le chargement s’arrête avant de lire ou d’écrire quoi que ce soit', async () => {
		const { appels, payload } = fauxPayload(ANCIENNE_PREPROD.DATABASE_URI)

		await expect(
			poserLesProfilsDuJeu(payload, { variables: { ...ANCIENNE_PREPROD, APP_ENV: 'prod' } })
		).rejects.toBeInstanceOf(JeuFictifRefuse)
		expect(appels).toEqual([])
	})

	test('quand Payload est branché ailleurs que l’environnement ne le dit, rien n’est lu ni écrit', async () => {
		const { appels, payload } = fauxPayload('postgres://mymakeup:local-dev-only@127.0.0.1:5442/mymakeup_dev')

		expect(refus(() => exigerLaCibleDuJeu(payload, BANC))).toContain(
			'Payload n’est pas branché sur la base que DATABASE_URI désigne.'
		)
		await expect(poserLesProfilsDuJeu(payload, { variables: BANC })).rejects.toBeInstanceOf(JeuFictifRefuse)
		expect(appels).toEqual([])
	})

	test('sur le banc, le chargement passe la garde et commence par chercher le compte du premier type', async () => {
		// The witness of the two tests above: the same fake Payload, connected to the bench, goes on
		// to its first read, which it refuses.
		const { appels, payload } = fauxPayload(BANC.DATABASE_URI)

		await expect(poserLesProfilsDuJeu(payload, { variables: BANC })).rejects.toThrow('find ne devait pas être appelé')
		expect(appels).toEqual(['find'])
	})
})

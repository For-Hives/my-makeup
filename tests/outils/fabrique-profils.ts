/**
 * The factory of generated profiles (ticket 100; plan 02 §6: « Seed séparé de 500 profils générés
 * pour I31 »): `n` made-up makeup artists, each with her own account, a commune, a speciality, a
 * description of about 600 characters, skills and offers. The texts are drawn from a small
 * vocabulary by the rank of the profile alone, so a run gives the same profiles every time, and a
 * word of the vocabulary is held by a known share of them.
 *
 * Everything is fictional: accounts in `@example.test`, names « Générée n », communes of the official
 * list (public reference data). Not for a deployed site: it writes through the Payload of the test
 * bench.
 */

import type { APIRequestContext, APIResponse } from '@playwright/test'
import type { Payload } from 'payload'
import { CONTEXTE_SANS_PROFIL } from '../../src/collections/Profiles'
import { creerCompte } from './fabrique-comptes'

/** Communes of the official list, with their INSEE code and the centre of the commune. */
const COMMUNES = [
	{ name: 'Annecy', inseeCode: '74010', latitude: 45.9, longitude: 6.13 },
	{ name: 'Annemasse', inseeCode: '74012', latitude: 46.19, longitude: 6.25 },
	{ name: 'Thonon-les-Bains', inseeCode: '74281', latitude: 46.37, longitude: 6.48 },
	{ name: 'Nantes', inseeCode: '44109', latitude: 47.24, longitude: -1.56 },
	{ name: 'Lyon', inseeCode: '69123', latitude: 45.76, longitude: 4.84 },
	{ name: 'Lille', inseeCode: '59350', latitude: 50.63, longitude: 3.06 },
	{ name: 'Bordeaux', inseeCode: '33063', latitude: 44.84, longitude: -0.58 },
	{ name: 'Toulouse', inseeCode: '31555', latitude: 43.6, longitude: 1.44 },
	{ name: 'Rennes', inseeCode: '35238', latitude: 48.11, longitude: -1.68 },
	{ name: 'Marseille', inseeCode: '13055', latitude: 43.3, longitude: 5.37 },
] as const

export const SPECIALITES_GENEREES = [
	'Maquillage mariée',
	'Maquillage de plateau',
	'Effets spéciaux',
	'Maquillage artistique',
	'Teint et soin',
	'Maquillage de soirée',
] as const

const COMPETENCES = ['Teint', 'Regard', 'Mains', 'Coiffure', 'Body painting', 'Prothèses', 'Visage', 'Peau mature']

const PHRASES = [
	'Je me déplace avec mes produits dans toute la région, du lundi au samedi.',
	'Mon travail est pensé pour durer toute la journée, de la cérémonie à la soirée.',
	'Je prépare chaque rendez-vous avec un essai et une fiche de teint.',
	'Les produits que j’utilise sont adaptés aux peaux sensibles.',
	'Je travaille pour des shootings, des défilés et des tournages.',
	'Un devis gratuit est envoyé sous deux jours.',
	'Le maquillage est réalisé chez vous ou dans mon espace de travail.',
]

/** The marker word of the profiles of the factory, held by none of the vocabulary above. */
export const MOT_DES_PROFILS_GENERES = 'zyglo'

/** The communes far from the Haute-Savoie and from Nantes, for a run that must not change the other searches of a shared bench. */
export const COMMUNES_ELOIGNEES = COMMUNES.filter(({ name }) =>
	['Lille', 'Bordeaux', 'Toulouse', 'Rennes', 'Marseille'].includes(name)
)

export interface OptionsDeLaFabrique {
	/** The communes the profiles are spread over (default: ten communes, one profile in ten in Annecy). */
	communes?: readonly (typeof COMMUNES)[number][]
	/** False: no profile travels (default: one in three has a radius of 30 km). */
	seDeplacent?: boolean
	/** Starts the slug and the address of each profile: two runs with other prefixes do not meet. */
	prefixe?: string
	/** A word every profile of the run carries in its description (default: one profile in fifty carries `MOT_DES_PROFILS_GENERES`). */
	marqueur?: string
}

/** Her identity and her texts, by her rank: the same every time. */
export function profilGenere(
	rang: number,
	{ prefixe = 'generee', marqueur, communes = COMMUNES, seDeplacent = true }: OptionsDeLaFabrique = {}
) {
	const commune = communes[rang % communes.length] ?? COMMUNES[0]
	const description = Array.from({ length: 8 }, (_, i) => PHRASES[(rang + i * 3) % PHRASES.length]).join(' ')
	return {
		slug: `${prefixe}-${rang}`,
		firstName: 'Générée',
		lastName: `Numéro ${rang}`,
		specialty: SPECIALITES_GENEREES[rang % SPECIALITES_GENEREES.length],
		city: commune,
		radiusKm: seDeplacent && rang % 3 === 0 ? 30 : null,
		description: `${description} ${marqueur ?? (rang % 50 === 0 ? MOT_DES_PROFILS_GENERES : '')}`.trim(),
		skills: [0, 1, 2].map(i => ({
			name: COMPETENCES[(rang + i) % COMPETENCES.length],
			description: `Savoir-faire ${COMPETENCES[(rang + i) % COMPETENCES.length]?.toLowerCase()}, appris en école puis en studio.`,
		})),
		serviceOffers: [
			{
				name: 'Forfait journée',
				description: `Prestation ${rang % 2 === 0 ? 'journée' : 'soirée'} avec essai inclus.`,
			},
			{ name: 'Séance', description: 'Une séance de maquillage de deux heures.' },
		],
	}
}

/** `n` runs of `tache`, ten at a time. */
async function parLots<T>(n: number, tache: (i: number) => Promise<T>): Promise<T[]> {
	const sortie: T[] = []
	for (let debut = 0; debut < n; debut += 10) {
		const lot = Array.from({ length: Math.min(10, n - debut) }, (_, i) => tache(debut + i))
		sortie.push(...(await Promise.all(lot)))
	}
	return sortie
}

/** Creates `n` generated profiles, published and listed. Returns their slugs, in order. */
export async function fabriquerDesProfils(
	payload: Payload,
	n: number,
	options: OptionsDeLaFabrique = {}
): Promise<string[]> {
	const prefixe = options.prefixe ?? 'generee'
	return parLots(n, async rang => {
		const { slug, ...profil } = profilGenere(rang, options)
		const pro = await payload.create({
			collection: 'pros',
			data: {
				email: `${prefixe}-${rang}@example.test`,
				password: `Banc-${rang}-${crypto.randomUUID()}`,
				name: `Générée ${rang}`,
				_verified: true,
			},
			context: CONTEXTE_SANS_PROFIL,
			disableVerificationEmail: true,
		})
		await payload.create({ collection: 'profiles', data: { ...profil, slug, pro: pro.id } })
		return slug
	})
}

/** The headers of an admin session, for the REST API of the running application. */
async function entetesDeLAdmin(): Promise<Record<string, string>> {
	return (await creerCompte('admin')).session.enTetes
}

/**
 * Creates `n` generated profiles THROUGH the running application (its REST API, as an admin), so that
 * every save refreshes the pages that list the profiles, as it does for a visitor: a profile written
 * with the Payload of the test process would not reach the cache of the server. The account of each is
 * named « <prefixe> <rang> », which gives the slug « <prefixe>-<rang> ». Returns the identifiers to remove them.
 */
export async function fabriquerParLApplication(
	request: APIRequestContext,
	n: number,
	options: OptionsDeLaFabrique & { prefixe: string }
): Promise<{ pros: number[]; profils: number[] }> {
	const entetes = await entetesDeLAdmin()
	const verifie = async (reponse: APIResponse, quoi: string) => {
		if (!reponse.ok()) throw new Error(`${quoi} a répondu ${reponse.status()} : ${await reponse.text()}`)
		return reponse
	}
	const pros: number[] = []
	const profils: number[] = []
	for (let debut = 0; debut < n; debut += 5) {
		const lot = await Promise.all(
			Array.from({ length: Math.min(5, n - debut) }, async (_, i) => {
				const rang = debut + i
				const { slug: _slug, ...profil } = profilGenere(rang, options)
				const pro = (await (
					await verifie(
						await request.post('/api/pros', {
							headers: entetes,
							data: {
								email: `${options.prefixe}-${rang}@example.test`,
								password: `Banc-${rang}-${crypto.randomUUID()}`,
								name: `${options.prefixe} ${rang}`,
								_verified: true,
							},
						}),
						'La création d’un compte'
					)
				).json()) as { doc: { id: number } }
				const { docs } = (await (
					await verifie(
						await request.get(`/api/profiles?where[pro][equals]=${pro.doc.id}&depth=0&limit=1`, { headers: entetes }),
						'La lecture d’un profil'
					)
				).json()) as { docs: { id: number }[] }
				const cree = docs[0]
				if (!cree) throw new Error('Le compte créé n’a pas son profil.')
				await verifie(
					await request.patch(`/api/profiles/${cree.id}`, { headers: entetes, data: profil }),
					'L’écriture d’un profil'
				)
				return { pro: pro.doc.id, profil: cree.id }
			})
		)
		for (const { pro, profil } of lot) {
			pros.push(pro)
			profils.push(profil)
		}
	}
	return { pros, profils }
}

/** Deletes, through the application, the profiles and the accounts `fabriquerParLApplication` made. */
export async function retirerParLApplication(
	request: APIRequestContext,
	{ pros, profils }: { pros: readonly number[]; profils: readonly number[] }
): Promise<void> {
	const entetes = await entetesDeLAdmin()
	for (const id of profils) await request.delete(`/api/profiles/${id}`, { headers: entetes })
	for (const id of pros) await request.delete(`/api/pros/${id}`, { headers: entetes })
}

/** Deletes the profiles of a run and their accounts, by the prefix of their slug. */
export async function retirerLesProfilsFabriques(payload: Payload, prefixe: string): Promise<void> {
	const { docs } = await payload.find({
		collection: 'profiles',
		where: { slug: { like: `${prefixe}-` } },
		depth: 0,
		limit: 1000,
		pagination: false,
		select: { pro: true },
	})
	for (const { id, pro } of docs) {
		await payload.delete({ collection: 'profiles', id })
		await payload.delete({ collection: 'pros', id: typeof pro === 'object' ? pro.id : pro })
	}
}

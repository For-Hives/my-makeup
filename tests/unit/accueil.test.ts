/**
 * The home page (ticket 097; plan 02 U50): the talents it lists, the icons it knows, and the structured
 * data it carries. Unit tests: no database, no server (the page itself is tests/e2e/accueil.spec.ts).
 */

import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Payload } from 'payload'
import { TALENTS_AVEC_ICONE } from '@/components/home/Talents'
import { RESEAUX } from '@/components/layout/liens'
import {
	donneesStructureesDeLAccueil,
	IDENTIFIANT_DE_L_ORGANISATION,
	LOGO_DU_SITE,
	serializeJsonLd,
} from '@/lib/seo/json-ld'
import { SITE_ORIGIN } from '@/lib/urls-gelees'
import { TALENTS_LIMIT, listTalents } from '@/services/public/talents'

const RACINE = join(import.meta.dir, '../..')

describe('les talents de l’accueil', () => {
	function payloadEspion(docs: unknown[]) {
		const lectures: Record<string, unknown>[] = []
		const payload = {
			find: async (options: Record<string, unknown>) => {
				lectures.push(options)
				return { docs }
			},
		}
		return { payload: payload as unknown as Payload, lectures }
	}

	test('la lecture choisit deux champs, garde les règles d’accès et se borne elle-même', async () => {
		const { payload, lectures } = payloadEspion([])

		await listTalents(payload)

		expect(lectures).toHaveLength(1)
		expect(lectures[0]).toMatchObject({
			collection: 'talents',
			select: { slug: true, title: true },
			overrideAccess: false,
			limit: TALENTS_LIMIT,
		})
	})

	test('chaque talent est un titre et une adresse ; un talent sans titre ou sans adresse valable est laissé de côté', async () => {
		const { payload } = payloadEspion([
			{ slug: 'maquillage-mariee', title: 'Maquillage de mariée', content: 'jamais lu' },
			{ slug: 'Pas Une Adresse', title: 'Mauvaise adresse' },
			{ slug: 'sans-titre', title: '  ' },
			{ slug: 'indefini', title: 'undefined' },
		])

		expect(await listTalents(payload)).toEqual([{ slug: 'maquillage-mariee', titre: 'Maquillage de mariée' }])
	})
})

describe('aucune promesse retirée par CONF-01', () => {
	const fichiersDe = (dossier: string): string[] =>
		readdirSync(dossier).flatMap(nom => {
			const chemin = join(dossier, nom)
			return statSync(chemin).isDirectory() ? fichiersDe(chemin) : /\.tsx?$/.test(nom) ? [chemin] : []
		})

	test('ni « milliers », ni « paiement sécurisé », ni « avis vérifiés », ni « réservation » dans la page et ses blocs', () => {
		const fichiers = [
			...fichiersDe(join(RACINE, 'src/components/accueil')),
			...fichiersDe(join(RACINE, 'src/components/blocs')),
			join(RACINE, 'src/app/(front)/(site)/page.tsx'),
		]
		expect(fichiers.length).toBeGreaterThan(8)
		const trouves = fichiers.filter(fichier =>
			/milliers|paiement sécurisé|avis vérifiés|réservation/i.test(readFileSync(fichier, 'utf8'))
		)
		expect(trouves).toEqual([])
	})
})

describe('les icônes des talents', () => {
	test('la liste des talents qui ont une icône est celle du dossier public/assets/talents', () => {
		const fichiers = readdirSync(join(RACINE, 'public/assets/talents'))
			.filter(nom => nom.endsWith('.svg'))
			.map(nom => nom.replace(/\.svg$/, ''))
		expect([...TALENTS_AVEC_ICONE].sort()).toEqual(fichiers.sort())
	})
})

describe('les données structurées de l’accueil (SEO-26)', () => {
	const sameAs = RESEAUX.filter(({ href }) => href.startsWith('https://')).map(({ href }) => href)
	const donnees = donneesStructureesDeLAccueil(sameAs)
	const [organisation, site] = donnees['@graph'] as Record<string, unknown>[]

	test('une organisation et un site, sur l’apex, avec des adresses absolues', () => {
		expect(donnees['@context']).toBe('https://schema.org')
		expect(organisation).toMatchObject({
			'@type': 'Organization',
			url: SITE_ORIGIN,
			logo: LOGO_DU_SITE,
			name: 'My-Makeup',
		})
		expect(site).toMatchObject({ '@type': 'WebSite', url: SITE_ORIGIN, inLanguage: 'fr-FR', name: 'My-Makeup' })
		expect(site?.publisher).toEqual({ '@id': IDENTIFIANT_DE_L_ORGANISATION })
		expect(organisation?.sameAs).toEqual(sameAs)
		expect(sameAs.length).toBeGreaterThan(0)
		for (const adresse of [LOGO_DU_SITE, ...sameAs]) expect(adresse).toMatch(/^https:\/\/[^/]+\//)
	})

	test('ni note, ni adresse postale, ni coordonnée de maquilleuse', () => {
		const texte = JSON.stringify(donnees)
		for (const interdit of [
			'AggregateRating',
			'aggregateRating',
			'PostalAddress',
			'address',
			'telephone',
			'email',
			'Review',
		])
			expect(texte, interdit).not.toContain(interdit)
	})

	test('sérialisé pour une balise script, il ne peut pas la fermer, et se relit à l’identique', () => {
		const texte = serializeJsonLd(donnees)
		expect(texte).not.toMatch(/[<>&]/)
		expect(JSON.parse(texte)).toEqual(donnees)
	})
})

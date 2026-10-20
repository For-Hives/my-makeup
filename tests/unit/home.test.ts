/**
 * The home page (ticket 097; plan 02 U50): the talents it lists, the icons it knows, and the structured
 * data it carries. Unit tests: no database, no server (the page itself is tests/e2e/accueil.spec.ts).
 */

import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Payload } from 'payload'
import { TALENTS_WITH_ICON } from '@/components/home/Talents'
import { NETWORKS } from '@/components/layout/links'
import { SITE_ORIGIN } from '@/lib/frozen-urls'
import { homeStructuredData, ORGANIZATION_ID, SITE_LOGO, serializeJsonLd } from '@/lib/seo/json-ld'
import { listTalents, TALENTS_LIMIT } from '@/services/public/talents'

const ROOT = join(import.meta.dir, '../..')

describe('les talents de l’accueil', () => {
	function payloadSpy(docs: unknown[]) {
		const readings: Record<string, unknown>[] = []
		const payload = {
			find: async (options: Record<string, unknown>) => {
				readings.push(options)
				return { docs }
			},
		}
		return { payload: payload as unknown as Payload, lectures: readings }
	}

	test('la lecture choisit deux champs, garde les règles d’accès et se borne elle-même', async () => {
		const { payload, lectures: readings } = payloadSpy([])

		await listTalents(payload)

		expect(readings).toHaveLength(1)
		expect(readings[0]).toMatchObject({
			collection: 'talents',
			select: { slug: true, title: true },
			overrideAccess: false,
			limit: TALENTS_LIMIT,
		})
	})

	test('chaque talent est un titre et une adresse ; un talent sans titre ou sans adresse valable est laissé de côté', async () => {
		const { payload } = payloadSpy([
			{ slug: 'maquillage-mariee', title: 'Maquillage de mariée', content: 'jamais lu' },
			{ slug: 'Pas Une Adresse', title: 'Mauvaise adresse' },
			{ slug: 'sans-titre', title: '  ' },
			{ slug: 'indefini', title: 'undefined' },
		])

		expect(await listTalents(payload)).toEqual([{ slug: 'maquillage-mariee', titre: 'Maquillage de mariée' }])
	})
})

describe('aucune promesse retirée par CONF-01', () => {
	const filesOf = (dossier: string): string[] =>
		readdirSync(dossier).flatMap(nom => {
			const filePath = join(dossier, nom)
			return statSync(filePath).isDirectory() ? filesOf(filePath) : /\.tsx?$/.test(nom) ? [filePath] : []
		})

	test('ni « milliers », ni « paiement sécurisé », ni « avis vérifiés », ni « réservation » dans la page et ses blocs', () => {
		const files = [
			...filesOf(join(ROOT, 'src/components/home')),
			...filesOf(join(ROOT, 'src/components/blocks')),
			join(ROOT, 'src/app/(front)/(site)/page.tsx'),
		]
		expect(files.length).toBeGreaterThan(8)
		const found = files.filter(fichier =>
			/milliers|paiement sécurisé|avis vérifiés|réservation/i.test(readFileSync(fichier, 'utf8'))
		)
		expect(found).toEqual([])
	})
})

describe('les icônes des talents', () => {
	test('la liste des talents qui ont une icône est celle du dossier public/assets/talents', () => {
		const files = readdirSync(join(ROOT, 'public/assets/talents'))
			.filter(nom => nom.endsWith('.svg'))
			.map(nom => nom.replace(/\.svg$/, ''))
		expect([...TALENTS_WITH_ICON].sort()).toEqual(files.sort())
	})
})

describe('les données structurées de l’accueil (SEO-26)', () => {
	const sameAs = NETWORKS.filter(({ href }) => href.startsWith('https://')).map(({ href }) => href)
	const data = homeStructuredData(sameAs)
	const [organization, site] = data['@graph'] as Record<string, unknown>[]

	test('une organisation et un site, sur l’apex, avec des adresses absolues', () => {
		expect(data['@context']).toBe('https://schema.org')
		expect(organization).toMatchObject({
			'@type': 'Organization',
			url: SITE_ORIGIN,
			logo: SITE_LOGO,
			name: 'My-Makeup',
		})
		expect(site).toMatchObject({ '@type': 'WebSite', url: SITE_ORIGIN, inLanguage: 'fr-FR', name: 'My-Makeup' })
		expect(site?.publisher).toEqual({ '@id': ORGANIZATION_ID })
		expect(organization?.sameAs).toEqual(sameAs)
		expect(sameAs.length).toBeGreaterThan(0)
		for (const url of [SITE_LOGO, ...sameAs]) expect(url).toMatch(/^https:\/\/[^/]+\//)
	})

	test('ni note, ni adresse postale, ni coordonnée de maquilleuse', () => {
		const text = JSON.stringify(data)
		for (const forbidden of [
			'AggregateRating',
			'aggregateRating',
			'PostalAddress',
			'address',
			'telephone',
			'email',
			'Review',
		])
			expect(text, forbidden).not.toContain(forbidden)
	})

	test('sérialisé pour une balise script, il ne peut pas la fermer, et se relit à l’identique', () => {
		const text = serializeJsonLd(data)
		expect(text).not.toMatch(/[<>&]/)
		expect(JSON.parse(text)).toEqual(data)
	})
})

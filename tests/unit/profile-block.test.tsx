import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Payload } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProfileBlock } from '@/components/blocks/ProfileBlock'
import { AccountDeletion } from '@/components/dashboard/AccountDeletion'
import { AccountDeletedNotice } from '@/components/home/AccountDeletedNotice'
import { markAccountDeleted, takeAccountDeleted } from '@/lib/account-deleted'
import { contactEmailContent } from '@/lib/emails/contact'
import { TAGS } from '@/lib/revalidate'
import { normalizeTexts } from '@/lib/search/relevance'
import {
	ARTICLE_BLOCK_SIZE,
	profileBlockCards,
	TALENT_BLOCK_SIZE,
	talentBlockTitle,
} from '@/services/public/profile-block'
import { type DirectoryProfile, type ProfileCard, readDirectory } from '@/services/public/profiles'
import { openWindow } from '../support/dom-react'

/**
 * The makeup artists under a page of text, and the notice of the home page (ticket 305). Made-up values
 * only, no database: the run on the bench is tests/integration/profile-block.test.ts.
 */

function entry(slug: string, specialty: string, over: Partial<DirectoryProfile> = {}): DirectoryProfile {
	return {
		carte: {
			slug,
			pid: 1 as never,
			nom: slug,
			specialite: specialty,
			lieu: 'Annecy',
			superMaquilleuse: false,
			photo: null,
		},
		unreachable: false,
		indexable: true,
		ville: 'Annecy',
		departement: '74',
		seDeplace: false,
		postalCodes: [],
		center: null,
		radiusKm: null,
		farReach: false,
		sortName: slug,
		textes: normalizeTexts({
			ville: 'Annecy',
			specialite: specialty,
			description: '',
			competences: [],
			descriptionsDesCompetences: [],
			descriptionsDesPrestations: [],
			nom: slug,
			prenom: '',
		}),
		...over,
	}
}

const slugs = (cards: readonly ProfileCard[]) => cards.map(({ slug }) => slug)

describe('305 : les maquilleuses d’une spécialité', () => {
	const DIRECTORY = [
		entry('a-sans-contact', 'Maquillage de mariée', { unreachable: true }),
		entry('b-mariee', 'Maquillage de mariée'),
		entry('c-soiree', 'Maquillage de soirée'),
		entry('d-pas-publiable', 'Maquillage de mariée', { indexable: false }),
		entry('e-mariee', 'Mariée et soirée'),
	]

	test('seules les publiables et joignables de la spécialité, dans l’ordre de l’annuaire', () => {
		expect(slugs(profileBlockCards(DIRECTORY, { search: 'Maquillage de mariée', limit: 6 }))).toEqual([
			'b-mariee',
			'e-mariee',
		])
	})

	test('une injoignable n’est jamais en tête, ni ailleurs dans le bloc', () => {
		const cards = profileBlockCards(DIRECTORY, { search: 'Maquillage de mariée', limit: 6 })
		expect(slugs(cards)).not.toContain('a-sans-contact')
		expect(slugs(profileBlockCards(DIRECTORY, { search: '', limit: 6 }))).not.toContain('a-sans-contact')
	})

	test('six cartes au plus pour une spécialité, trois sous un article', () => {
		const many = Array.from({ length: 10 }, (_, n) => entry(`p-${n}`, 'Mariée'))
		expect(profileBlockCards(many, { search: 'mariée', limit: TALENT_BLOCK_SIZE })).toHaveLength(6)
		expect(profileBlockCards(many, { search: '', limit: ARTICLE_BLOCK_SIZE })).toHaveLength(3)
	})

	test('sans profil de la spécialité : aucune carte, donc aucun bloc', () => {
		const cards = profileBlockCards(DIRECTORY, { search: 'Maquillage artistique', limit: 6 })
		expect(cards).toEqual([])
		expect(renderToStaticMarkup(<ProfileBlock titre="Des maquilleuses pour votre x" cartes={cards} />)).toBe('')
	})

	test('le titre du bloc reprend celui de la spécialité', () => {
		expect(talentBlockTitle('Maquillage de mariée')).toBe('Des maquilleuses pour votre maquillage de mariée')
		expect(talentBlockTitle('  Maquillage pour la photo ')).toBe('Des maquilleuses pour votre maquillage pour la photo')
	})

	test('le bloc : six cartes, « Votre ville » vers la recherche avec la spécialité, sans script', () => {
		const cards = profileBlockCards(
			Array.from({ length: 8 }, (_, n) => entry(`p-${n}`, 'Mariée')),
			{ search: 'mariée', limit: 6 }
		)
		const html = renderToStaticMarkup(
			<ProfileBlock titre={talentBlockTitle('Maquillage de mariée')} cartes={cards} specialite="Maquillage de mariée" />
		)
		expect(html.match(/href="\/profil\//g)).toHaveLength(6)
		expect(html).toMatch(/<form [^>]*action="\/search" method="get"/)
		expect(html).toContain('name="specialite" value="Maquillage de mariée"')
		expect(html).toContain('name="city"')
		expect(html).toContain('Votre ville')
		expect(html).toContain('Des maquilleuses pour votre maquillage de mariée')
	})

	test('sous un article : pas de spécialité dans le formulaire', () => {
		const html = renderToStaticMarkup(
			<ProfileBlock titre="Des maquilleuses près de chez vous" cartes={[entry('p', 'Mariée').carte]} compact />
		)
		expect(html).not.toContain('name="specialite"')
		expect(html).toContain('name="city"')
	})

	test('l’annuaire dit si un profil est publiable', async () => {
		const doc = (id: number, publishable: boolean | null) => ({
			id,
			slug: `p-${id}`,
			firstName: 'Zoé',
			lastName: `P${id}`,
			specialty: 'Mariage',
			city: { name: 'Annecy', inseeCode: '74010', department: '74' },
			mainPicture: null,
			publishable,
		})
		const payload = {
			find: async (options: Record<string, unknown>) => {
				const select = options.select as Record<string, unknown>
				if (options.collection === 'media' || options.collection === 'activity-checks') return { docs: [] }
				if (select?.strapiId === true) return { docs: [] }
				if (select?.networks === true) return { docs: [] }
				if (select?.verified === true) return { docs: [] }
				expect(select.publishable).toBe(true)
				return { docs: [doc(1, true), doc(2, false), doc(3, null)], page: 1, totalDocs: 3, hasNextPage: false }
			},
		} as unknown as Payload
		expect((await readDirectory(payload)).map(item => item.indexable)).toEqual([true, false, false])
	})

	test('l’annuaire lit « Vérifiée » à part, règles ouvertes, et n’en garde que le fait (issue 1066)', async () => {
		const doc = (id: number) => ({
			id,
			slug: `p-${id}`,
			firstName: 'Zoé',
			lastName: `P${id}`,
			specialty: 'Mariage',
			city: { name: 'Annecy', inseeCode: '74010', department: '74' },
			mainPicture: null,
			publishable: true,
		})
		const reads: { select: Record<string, unknown>; overrideAccess: unknown }[] = []
		const payload = {
			find: async (options: Record<string, unknown>) => {
				const select = options.select as Record<string, unknown>
				reads.push({ select, overrideAccess: options.overrideAccess })
				if (options.collection === 'media' || options.collection === 'activity-checks') return { docs: [] }
				if (select?.strapiId === true || select?.networks === true) return { docs: [] }
				if (select?.verified === true) return { docs: [{ id: 2 }] }
				return { docs: [doc(1), doc(2), doc(3)], page: 1, totalDocs: 3, hasNextPage: false }
			},
		} as unknown as Payload
		const directory = await readDirectory(payload)
		expect(directory.map(item => item.verified)).toEqual([false, true, false])
		// The box is closed to the public read: the listing never selects it, the apart read has the rules open.
		const listing = reads.find(read => read.select.publishable === true)
		expect(listing?.select.verified).toBeUndefined()
		expect(listing?.overrideAccess).toBe(false)
		expect(reads.find(read => read.select.verified === true)?.overrideAccess).toBe(true)
		// And a card carries nothing of it.
		expect(JSON.stringify(directory.map(item => item.carte))).not.toContain('verified')
	})

	test('le bloc est gardé sous l’étiquette des profils : la publication d’un profil le rafraîchit', () => {
		const source = readFileSync(join(import.meta.dir, '../../src/services/public/cached.ts'), 'utf8')
		const declaration = source.slice(source.indexOf('export const cachedProfileBlock'))
		expect(declaration.slice(0, declaration.indexOf('\n)\n'))).toContain('tags: [TAGS.profils]')
		expect(TAGS.profils).toBe('profils')
	})
})

describe('305 : les pages talent et article lisent le bloc sans casser la page', () => {
	test('la page talent et la page article attrapent l’échec de la lecture', () => {
		for (const page of ['talent', 'blog']) {
			const source = readFileSync(join(import.meta.dir, `../../src/app/(front)/(site)/${page}/[slug]/page.tsx`), 'utf8')
			expect(source).toContain('cachedProfileBlock')
			expect(source).toMatch(/catch \{\s*return \[\]/)
		}
	})
})

describe('305 : le téléphone du formulaire de contact est facultatif', () => {
	const MESSAGE = { prenom: 'Léa', nom: 'Témoin', email: 'lea@example.test', telephone: '', message: 'Bonjour.' }

	test('le mail à l’équipe n’a pas de ligne de téléphone vide', () => {
		const lines = contactEmailContent(MESSAGE).paragraphes
		expect(lines.some(line => line.startsWith('Numéro de téléphone'))).toBe(false)
		expect(contactEmailContent({ ...MESSAGE, telephone: '01 99 00 12 34' }).paragraphes).toContain(
			'Numéro de téléphone : 01 99 00 12 34'
		)
	})
})

describe('305 : « Ton compte est supprimé » sur l’accueil', () => {
	const dom = openWindow()

	test('le drapeau se lit une fois, puis il est effacé', () => {
		expect(takeAccountDeleted()).toBe(false)
		markAccountDeleted()
		expect(takeAccountDeleted()).toBe(true)
		expect(takeAccountDeleted()).toBe(false)
	})

	test('l’accueil porte le message dans une zone role="status" après une suppression, sans rien dans l’adresse', async () => {
		markAccountDeleted()
		const zone = await dom.monter(<AccountDeletedNotice />)
		await dom.attendre(() => zone.textContent)
		expect(zone.querySelector('[role="status"]')?.textContent).toContain('Ton compte est supprimé')
		expect(dom.w.location.href).toBe('http://localhost/')
	})

	test('sans suppression, la zone est là mais vide', async () => {
		const zone = await dom.monter(<AccountDeletedNotice />)
		expect(zone.querySelector('[role="status"]')).not.toBeNull()
		expect(zone.querySelector('[role="status"]')?.textContent).toBe('')
	})

	test('la suppression réussie pose le drapeau avant de quitter la page', async () => {
		const left: string[] = []
		await dom.monter(
			<AccountDeletion mode="mot-de-passe" envoyer={async () => ({ ok: true })} aller={adresse => left.push(adresse)} />
		)
		await dom.cliquer(dom.bouton('Supprimer mon compte'))
		await dom.saisir(dom.champ('Retape ton mot de passe pour confirmer'), 'mon secret fictif')
		await dom.cliquer(dom.bouton('Supprimer définitivement mon compte'))
		expect(left).toEqual(['/'])
		expect(takeAccountDeleted()).toBe(true)
	})

	test('un navigateur qui refuse le stockage ne casse rien', () => {
		Object.defineProperty(dom.w, 'sessionStorage', {
			configurable: true,
			get() {
				throw new Error('refusé')
			},
		})
		expect(() => markAccountDeleted()).not.toThrow()
		expect(takeAccountDeleted()).toBe(false)
	})
})

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { MyViews } from '@/components/dashboard/MyViews'
import { OverviewStatus } from '@/components/dashboard/overview/OverviewStatus'
import type { DashboardProfile } from '@/lib/dashboard/cards'
import { blockAnchor, CRITERION_BLOCK } from '@/lib/dashboard/edit-blocks'
import { gaugePercent, type Missing, overviewStatus, profileProgress } from '@/lib/dashboard/progress'
import { editPath } from '@/lib/direct-edit/edit-mode'
import { CRITERIA } from '@/lib/profile/completeness'
import { lastViewDays } from '@/lib/views/profile-views'
import { ANNECY } from '../support/completeness-cases'

/**
 * « Mon espace » is a summary (issue 1073): the status of her profile, how far it is filled, what misses with a link
 * to the block of the edit mode that completes it, her views, and no editor of her profile. Made-up values only.
 */

const PUBLISHABLE: DashboardProfile = {
	id: 1,
	firstName: 'Léa',
	lastName: 'Fictive',
	specialty: 'Mariage',
	description: 'Maquilleuse fictive. '.repeat(12),
	city: ANNECY,
	mainPicture: 5,
	serviceOffers: [{ name: 'Mariée', priceFrom: 120 }],
	networks: { instagram: 'studio.fictif' },
}

describe('le statut du profil', () => {
	test('publiable : visible de toutes', () => {
		expect(overviewStatus(profileProgress(PUBLISHABLE))).toMatchObject({ code: 'visible', paused: false })
	})

	test('vide ou incomplet : en brouillon', () => {
		expect(overviewStatus(profileProgress({ id: 2 })).code).toBe('draft')
		expect(overviewStatus(profileProgress({ ...PUBLISHABLE, description: 'Court.' })).code).toBe('draft')
	})

	test('masqué par l’équipe : le motif, jamais « visible »', () => {
		const status = overviewStatus(profileProgress({ ...PUBLISHABLE, status: 'hidden', reason: 'Photos hors sujet.' }))
		expect(status.code).toBe('hidden')
		expect(`${status.title} ${status.text}`).toContain('Photos hors sujet.')
		expect(`${status.title} ${status.text}`).not.toMatch(/visible de toutes|publiable/)
	})

	test('en pause : la page reste visible, la recherche l’écarte', () => {
		const status = overviewStatus(profileProgress({ ...PUBLISHABLE, available: false }))
		expect(status).toMatchObject({ code: 'visible', paused: true })
	})
})

describe('l’avancement', () => {
	const missing = (requis: boolean): Missing => ({ critere: 'description', texte: '', section: 'description', requis })

	test('le pourcentage de la règle unique, jamais 100 % tant qu’un point indispensable manque', () => {
		expect(gaugePercent(profileProgress(PUBLISHABLE))).toBe(profileProgress(PUBLISHABLE).pourcentage)
		expect(gaugePercent({ pourcentage: 100, manques: [missing(true)] })).toBe(99)
		expect(gaugePercent({ pourcentage: 100, manques: [missing(false)] })).toBe(100)
		expect(gaugePercent({ pourcentage: 40, manques: [missing(true)] })).toBe(40)
	})
})

describe('la liste de ce qui manque', () => {
	test('chaque point mène au bloc de l’édition qui le complète', () => {
		const html = renderToStaticMarkup(<OverviewStatus progress={profileProgress({ id: 2 })} />)
		expect(html).toContain('Ton profil est rempli à ')
		for (const criterion of CRITERIA) {
			const block = CRITERION_BLOCK[criterion]
			expect(html).toContain(`href="${editPath()}#${blockAnchor(block)}"`)
		}
		// Every link goes to the edit mode, never to an editor of this page.
		const links = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1] ?? '')
		expect(links.filter(link => link.startsWith('#carte-') || link.startsWith('#bloc-'))).toEqual([])
	})
})

describe('les vues', () => {
	test('à zéro : la phrase le dit, un graphique plat, jamais « null »', () => {
		const html = renderToStaticMarkup(<MyViews jours={lastViewDays([], new Date('2026-10-24T10:00:00Z'))} />)
		expect(html).toContain('Ta page n’a pas encore été vue ces 30 derniers jours.')
		expect(html).not.toMatch(/\bnull\b|undefined|NaN/)
	})
})

describe('aucun éditeur du profil sur « Mon espace »', () => {
	const ROOT = path.resolve(import.meta.dir, '../..')
	const page = readFileSync(path.join(ROOT, 'src/app/(front)/(dashboard)/auth/profil/page.tsx'), 'utf8')
	const imports = [...page.matchAll(/from '([^']+)'/g)].map(match => match[1] ?? '')

	test('la page n’importe aucun éditeur de photo, d’identité, de zone, de prestations, de coordonnées ni de réseaux', () => {
		const forbidden = imports.filter(
			source =>
				/dashboard\/(PhotoEditor|IdentityEditor|LocationEditor|PortfolioEditor|NetworksEditor|ContactDetailsEditor|DescriptionEditor|BulletsEditor|SectionCard|CollapsibleCards)$/.test(
					source
				) ||
				(/dashboard\/ListsEditors$/.test(source) && /ServiceOffersEditor|CoursesEditor/.test(page)) ||
				(source.includes('components/direct-edit') && !source.endsWith('/fonts'))
		)
		expect(forbidden).toEqual([])
		expect(page).not.toMatch(
			/saveMy(Identity|MainPicture|Location|ServiceOffers|ContactDetails|Networks|Portfolio|Description|Skills|Languages|Courses)\b/
		)
	})
})

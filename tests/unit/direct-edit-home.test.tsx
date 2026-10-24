import { describe, expect, test } from 'bun:test'
import { act } from 'react'
import type { DashboardProfile } from '@/lib/dashboard/cards'
import { draftNotice } from '@/lib/dashboard/draft-notice'
import { DASHBOARD_PATH } from '@/lib/dashboard/preview'
import { gaugePercent, type Missing, profileProgress } from '@/lib/dashboard/progress'
import { blockAnchor, CRITERION_BLOCK } from '@/lib/direct-edit/blocks'
import { editPath, previewPath } from '@/lib/direct-edit/edit-mode'
import { CRITERIA } from '@/lib/profile/completeness'
import { benchOf, EMPTY, FULL } from '../support/direct-edit-bench'
import { openWindow } from '../support/dom-react'

/**
 * Her space opens on her profile (issue 1022): the completeness panel above the page counts the same
 * fields as the single rule, every point it lists leads to a block that exists on the page, and the
 * modes « Édition » and « Aperçu » never drop what she typed.
 */

const window_ = openWindow()
const doc = () => window_.w.document
const alerts = () => [...doc().querySelectorAll('[role="alert"]')].map(alert => alert.textContent).join('|')

describe('les adresses de l’espace', () => {
	test('l’édition est la page du profil, l’aperçu en est un mode : plus aucune adresse à part', () => {
		expect(DASHBOARD_PATH).toBe('/auth/profil')
		expect(editPath()).toBe('/auth/profil')
		expect(previewPath()).toBe('/auth/profil?mode=preview')
		expect(draftNotice(profileProgress({ id: 3 }))?.href).toBe('/auth/profil#bloc-identity')
	})
})

describe('la jauge', () => {
	const missing = (requis: boolean): Missing => ({
		critere: 'description',
		texte: '',
		section: 'description',
		requis,
	})

	test('elle reprend le pourcentage de la règle unique', () => {
		const progress = profileProgress(FULL)
		expect(gaugePercent(progress)).toBe(progress.pourcentage)
		expect(gaugePercent({ pourcentage: 54, manques: [missing(false)] })).toBe(54)
	})

	test('jamais 100 % tant qu’un point indispensable manque : les 13 critères et les 6 conditions ne sont pas les mêmes', () => {
		expect(gaugePercent({ pourcentage: 100, manques: [missing(true)] })).toBe(99)
		expect(gaugePercent({ pourcentage: 100, manques: [] })).toBe(100)
		expect(gaugePercent({ pourcentage: 100, manques: [missing(false)] })).toBe(100)
	})
})

describe('chaque point mène à un bloc qui existe', () => {
	test('les treize critères ont un bloc, et le bloc est sur la page d’un profil vide', async () => {
		await benchOf(window_, { profile: EMPTY, withPanel: true }).mount()
		for (const criterion of CRITERIA) {
			const block = CRITERION_BLOCK[criterion]
			expect(block).toBeDefined()
			expect(doc().getElementById(blockAnchor(block))).not.toBeNull()
		}
	})

	test('le panneau dit « Ton profil est rempli à N % » et chaque lien pointe vers son bloc', async () => {
		const progress = profileProgress(EMPTY)
		await benchOf(window_, { profile: EMPTY, withPanel: true }).mount()
		expect(doc().querySelector('[data-testid="completeness"] h2')?.textContent).toBe(
			`Ton profil est rempli à ${gaugePercent(progress)} %`
		)
		expect(doc().querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe(
			String(gaugePercent(progress))
		)
		const links = [...doc().querySelectorAll<HTMLAnchorElement>('[data-testid="completeness"] a[data-missing]')]
		expect(links.length).toBeGreaterThan(0)
		for (const link of links) {
			const hash = link.getAttribute('href') ?? ''
			expect(hash.startsWith('#bloc-')).toBe(true)
			expect(doc().getElementById(hash.slice(1))).not.toBeNull()
		}
	})

	test('le contact manquant mène aux coordonnées de la page, plus à une carte de l’ancien espace', async () => {
		await benchOf(window_, { profile: EMPTY, withPanel: true }).mount()
		expect(doc().querySelector('[data-testid="completeness"] a[href^="#carte-"]')).toBeNull()
	})

	test('un appui sur un point ouvre son bloc, l’éditeur est sous l’en-tête', async () => {
		await benchOf(window_, { profile: EMPTY, withPanel: true }).mount()
		const link = doc().querySelector<HTMLAnchorElement>('[data-testid="completeness"] a[data-missing="description"]')
		if (link === null) throw new Error('missing point « description » expected')
		await window_.cliquer(link)
		expect(window_.bouton('Modifier ma présentation').getAttribute('aria-expanded')).toBe('true')
	})

	test('avec une saisie non enregistrée, un appui sur un autre point demande avant d’ouvrir', async () => {
		await benchOf(window_, { profile: EMPTY, withPanel: true }).mount()
		await window_.cliquer(window_.bouton('Modifier mes compétences'))
		await window_.saisir(window_.champ('Compétence'), 'Peaux matures')
		const link = doc().querySelector<HTMLAnchorElement>('[data-testid="completeness"] a[data-missing="description"]')
		if (link === null) throw new Error('missing point « description » expected')
		await window_.cliquer(link)
		expect(alerts()).toContain('modifications non enregistrées')
		expect(window_.bouton('Modifier ma présentation').getAttribute('aria-expanded')).toBe('false')
	})
})

describe('Édition et Aperçu', () => {
	test('Édition est la page où elle est, Aperçu mène au mode aperçu', async () => {
		await benchOf(window_, { withPanel: true }).mount()
		const edition = doc().querySelector('[data-testid="mode-edition"]')
		expect(edition?.getAttribute('aria-current')).toBe('page')
		expect(doc().querySelector('[data-testid="mode-apercu"]')?.getAttribute('href')).toBe('/auth/profil?mode=preview')
	})

	test('sans saisie en cours, Aperçu s’ouvre tout de suite', async () => {
		const bench = benchOf(window_, { withPanel: true })
		await bench.mount()
		const link = doc().querySelector<HTMLAnchorElement>('[data-testid="mode-apercu"]')
		if (link === null) throw new Error('Aperçu expected')
		await window_.cliquer(link)
		expect(bench.navigations).toEqual(['/auth/profil?mode=preview'])
	})

	test('avec une saisie non enregistrée, Aperçu demande d’abord : Continuer reste, Abandonner part', async () => {
		const bench = benchOf(window_, { withPanel: true })
		await bench.mount()
		await window_.cliquer(window_.bouton('Modifier mes compétences'))
		await window_.saisir(window_.champ('Compétence'), 'Peaux matures')
		const link = doc().querySelector<HTMLAnchorElement>('[data-testid="mode-apercu"]')
		if (link === null) throw new Error('Aperçu expected')
		await window_.cliquer(link)
		expect(bench.navigations).toEqual([])
		expect(alerts()).toContain('modifications non enregistrées')
		await window_.cliquer(window_.bouton('Continuer à modifier'))
		expect(bench.navigations).toEqual([])
		expect((window_.champ('Compétence') as HTMLInputElement).value).toBe('Peaux matures')
		await window_.cliquer(link)
		await window_.cliquer(window_.bouton('Abandonner mes modifications'))
		await act(async () => {})
		expect(bench.navigations).toEqual(['/auth/profil?mode=preview'])
	})

	test('le lien Mon compte passe par la même garde', async () => {
		const bench = benchOf(window_, { withPanel: true })
		await bench.mount()
		await window_.cliquer(window_.bouton('Modifier mes compétences'))
		await window_.saisir(window_.champ('Compétence'), 'Peaux matures')
		const link = doc().querySelector<HTMLAnchorElement>('[data-testid="mon-compte"]')
		if (link === null) throw new Error('Mon compte expected')
		expect(link.getAttribute('href')).toBe('/auth/account')
		await window_.cliquer(link)
		expect(bench.navigations).toEqual([])
	})
})

describe('ce que la jauge dit de l’état', () => {
	const text = () => doc().querySelector('[data-testid="completeness"]')?.textContent ?? ''

	test('un brouillon dit que la page n’est pas en ligne, sans le texte d’un profil référencé', async () => {
		await benchOf(window_, { profile: EMPTY, withPanel: true }).mount()
		expect(text()).toContain('En brouillon')
		expect(text()).toContain('Ta page n’est pas encore en ligne : les clientes ne la voient pas.')
		expect(text()).not.toContain('Google')
	})

	test('une pause est dite en plus du brouillon', async () => {
		await benchOf(window_, {
			profile: { ...EMPTY, specialty: 'Mariage', available: false } as DashboardProfile,
			withPanel: true,
		}).mount()
		expect(text()).toContain('En brouillon')
		expect(doc().querySelector('[data-testid="completeness-consequence"]')?.textContent).toContain('Tu es en pause')
	})

	test('une page masquée dit son motif et n’a ni liste ni brouillon', async () => {
		await benchOf(window_, {
			profile: { ...EMPTY, status: 'hidden', reason: 'Photos hors sujet.' } as unknown as DashboardProfile,
			withPanel: true,
		}).mount()
		expect(text()).toContain('masquée par l’équipe')
		expect(text()).toContain('Motif : Photos hors sujet.')
		expect(doc().querySelector('[data-testid="brouillon"]')).toBeNull()
		expect(doc().querySelector('a[data-missing]')).toBeNull()
	})
})

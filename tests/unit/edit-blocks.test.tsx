import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { draftNotice } from '@/lib/dashboard/draft-notice'
import { BLOCK_IDS, blockAnchor, CRITERION_BLOCK, editBlockHref } from '@/lib/dashboard/edit-blocks'
import { gaugePercent, type Missing, profileProgress } from '@/lib/dashboard/progress'
import { editPath } from '@/lib/direct-edit/edit-mode'
import { CRITERIA } from '@/lib/profile/completeness'
import { benchOf, EMPTY } from '../support/direct-edit-bench'
import { openWindow } from '../support/dom-react'

/**
 * What misses from a profile, said once (issue 1075): the block of the edit mode that completes each criterion of the
 * single rule, the percentage, and the anchor of a block. The banner of the edit mode and the summary of her space read
 * this module and nothing else: no criterion is counted again outside `completeness.ts`.
 */

const window_ = openWindow()

describe('chaque critère de la règle unique a un bloc de l’édition', () => {
	test('les treize critères, un bloc chacun, dans la liste des blocs', () => {
		for (const criterion of CRITERIA) expect(BLOCK_IDS).toContain(CRITERION_BLOCK[criterion] as never)
	})

	test('chaque bloc nommé est sur la page d’un profil vide, avec l’ancre que le lien vise', async () => {
		await benchOf(window_, { profile: EMPTY }).mount()
		for (const criterion of CRITERIA) {
			const element = window_.w.document.getElementById(blockAnchor(CRITERION_BLOCK[criterion]))
			expect([criterion, element === null]).toEqual([criterion, false])
		}
	})

	test('le lien d’un bloc mène à l’édition, à son ancre', () => {
		expect(editBlockHref('photo')).toBe(`${editPath()}#bloc-photo`)
		expect(editBlockHref(null)).toBe(editPath())
	})

	test('l’encadré « En brouillon » mène au premier bloc qui manque, par le même tableau', () => {
		const notice = draftNotice(profileProgress({ id: 3 }))
		expect(notice?.href).toBe(`${editPath()}#bloc-identity`)
	})
})

describe('le pourcentage', () => {
	const missing = (requis: boolean): Missing => ({
		critere: 'description',
		texte: '',
		requis,
		google: false,
	})

	test('celui de la règle unique, jamais 100 % tant qu’un point indispensable manque', () => {
		const progress = profileProgress({ id: 2 })
		expect(gaugePercent(progress)).toBe(progress.pourcentage)
		expect(gaugePercent({ pourcentage: 100, manques: [missing(true)] })).toBe(99)
		expect(gaugePercent({ pourcentage: 100, manques: [missing(false)] })).toBe(100)
		expect(gaugePercent({ pourcentage: 40, manques: [missing(true)] })).toBe(40)
	})
})

describe('aucun critère n’est recompté hors de la règle unique', () => {
	const ROOT = path.resolve(import.meta.dir, '../..')
	const files = (dir: string): string[] =>
		readdirSync(dir).flatMap(name => {
			const full = path.join(dir, name)
			return statSync(full).isDirectory() ? files(full) : /\.tsx?$/.test(name) ? [full] : []
		})
	// Where the rule, its single mapping and its wording live.
	const ALLOWED = new Set([
		'src/lib/profile/completeness.ts',
		'src/lib/profile/state.ts',
		'src/lib/dashboard/progress.ts',
	])

	test('seuls la règle, son adaptateur et sa lecture comptent les critères ou calculent le pourcentage', () => {
		const users = files(path.join(ROOT, 'src'))
			.map(file => path.relative(ROOT, file))
			.filter(file => !ALLOWED.has(file))
			// The count of the criteria, their number out of which a share is made, the sum of the 13.
			.filter(file =>
				/\.sur\b|CRITERIA\.length|\.score\s*\/|pourcentage\s*[:=]\s*Math\.round/.test(
					readFileSync(path.join(ROOT, file), 'utf8')
				)
			)
		expect(users).toEqual([])
	})
})

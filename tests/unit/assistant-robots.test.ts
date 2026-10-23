import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { llmsText } from '../../src/lib/seo/llms'
import {
	ASSISTANT_PRIVATE_PATHS,
	ASSISTANT_SEARCH_BOTS,
	ASSISTANT_TRAINING_BOTS,
	robotsRules,
} from '../../src/lib/seo/robots'
import { deliveredStaticPages, EXCLUDED_PAGES, isExcluded } from '../../src/lib/seo/sitemap'

/**
 * Ticket 1014: the assistants' crawlers. The ones that fetch a page to answer someone (search, on-demand
 * reading) may read the public content; the ones that gather text to train a model are turned away. Neither
 * ever gets the account area, the administration, the API or the search.
 */

const ROOT = join(import.meta.dir, '../..')

type Rule = { userAgent: string | string[]; allow?: string | string[]; disallow?: string | string[] }
const rulesOf = (): Rule[] => {
	const { rules } = robotsRules()
	return (Array.isArray(rules) ? rules : [rules]) as Rule[]
}
const asList = (value: string | string[] | undefined): string[] =>
	value === undefined ? [] : Array.isArray(value) ? value : [value]
const ruleFor = (bot: string): Rule | undefined =>
	rulesOf().find(rule => asList(rule.userAgent).some(agent => agent.toLowerCase() === bot.toLowerCase()))

describe('robots.txt for the assistants', () => {
	test('each search or on-demand bot reads the public site and never the private paths', () => {
		expect(ASSISTANT_SEARCH_BOTS.length).toBeGreaterThanOrEqual(4)
		for (const bot of ASSISTANT_SEARCH_BOTS) {
			const rule = ruleFor(bot)
			expect({ bot, found: rule !== undefined }).toEqual({ bot, found: true })
			expect(asList(rule?.allow)).toEqual(['/'])
			for (const path of ['/api/', '/admin', '/auth', '/search']) {
				expect({ bot, path, blocked: asList(rule?.disallow).includes(path) }).toEqual({ bot, path, blocked: true })
			}
		}
	})

	test('each training bot is turned away from the whole site', () => {
		expect(ASSISTANT_TRAINING_BOTS).toContain('GPTBot')
		expect(ASSISTANT_TRAINING_BOTS).toContain('ClaudeBot')
		expect(ASSISTANT_TRAINING_BOTS).toContain('Google-Extended')
		for (const bot of ASSISTANT_TRAINING_BOTS) {
			const rule = ruleFor(bot)
			expect({ bot, disallow: asList(rule?.disallow) }).toEqual({ bot, disallow: ['/'] })
			expect(asList(rule?.allow)).toEqual([])
		}
	})

	test('a bot is either a search bot or a training bot, never both, and listed once', () => {
		const all = [...ASSISTANT_SEARCH_BOTS, ...ASSISTANT_TRAINING_BOTS].map(bot => bot.toLowerCase())
		expect(new Set(all).size).toBe(all.length)
	})

	test('the general group is unchanged: open to all but the API, so search engines still read the noindex', () => {
		const general = rulesOf().find(rule => asList(rule.userAgent).includes('*'))
		expect(general).toEqual({ userAgent: '*', allow: '/', disallow: ['/api/'] })
	})

	test('the private paths of the assistants are the ones the sitemap leaves out', () => {
		for (const path of ASSISTANT_PRIVATE_PATHS) expect(isExcluded(path.replace(/\/$/, ''))).toBe(true)
	})

	test('the sitemap is still given, on the apex', () => {
		expect(robotsRules().sitemap).toBe('https://my-makeup.fr/sitemap.xml')
	})
})

describe('snippets are never cut', () => {
	function sourceFiles(dir: string): string[] {
		return readdirSync(dir).flatMap(name => {
			const full = join(dir, name)
			if (statSync(full).isDirectory()) return sourceFiles(full)
			return /\.(ts|tsx)$/.test(name) ? [full] : []
		})
	}

	test('no code of the site sets noarchive, nosnippet, max-snippet or data-nosnippet', () => {
		const offenders = sourceFiles(join(ROOT, 'src')).filter(file =>
			/noarchive|nosnippet|max-snippet|data-nosnippet|noimageindex/i.test(readFileSync(file, 'utf8'))
		)
		expect(offenders.map(file => file.replace(ROOT, ''))).toEqual([])
	})
})

describe('/llms.txt', () => {
	const text = llmsText()

	test('is a route of the application, with no static file', () => {
		expect(existsSync(join(ROOT, 'public/llms.txt'))).toBe(false)
		expect(readFileSync(join(ROOT, 'src/app/llms.txt/route.ts'), 'utf8')).toContain('llmsText()')
	})

	test('starts with the name of the site, then a one-line summary, in the llms.txt layout', () => {
		const lines = text.split('\n')
		expect(lines[0]).toBe('# My Makeup')
		expect(lines[2]?.startsWith('> ')).toBe(true)
	})

	test('links every indexable fixed page, by its absolute address', () => {
		for (const page of deliveredStaticPages()) {
			const address = page.chemin === '/' ? 'https://my-makeup.fr' : `https://my-makeup.fr${page.chemin}`
			expect(text).toContain(`](${address})`)
		}
		expect(text).toContain('](https://my-makeup.fr/sitemap.xml)')
	})

	test('never links the account area, the administration, the API, the search or a profile', () => {
		const links = [...text.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map(match => match[1] ?? '')
		expect(links.length).toBeGreaterThan(10)
		for (const link of links) {
			expect(new URL(link).origin).toBe('https://my-makeup.fr')
			expect(link).not.toMatch(/\/(auth|admin|api|search|u|profil)(\/|$|\?)/)
		}
	})

	test('names no artist, no email address and no phone number', () => {
		expect(text).not.toMatch(/[^\s@]+@[^\s@]+\.[a-z]{2,}/i)
		expect(text).not.toMatch(/(?:\+33|0)\s?[1-9](?:[\s.]?\d{2}){4}/)
	})

	test('says the contact details are shown only when the artist chose it, and where the profiles are listed', () => {
		expect(text).toContain('sitemap.xml')
		expect(text).toMatch(/coordonnées/i)
	})

	test('the file is not in the sitemap', () => {
		expect(EXCLUDED_PAGES.map(page => page.chemin)).toContain('/llms.txt')
	})
})

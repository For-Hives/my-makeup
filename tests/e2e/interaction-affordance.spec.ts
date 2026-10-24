import { expect, type Page, test } from '@playwright/test'
import { pageProfilesUnderPrefix, setPageProfiles } from '../fixtures/page-profiles'
import { setSearchProfiles } from '../fixtures/search-profiles'
import {
	type AffordanceItem,
	affordanceDefect,
	freezeMotion,
	readAffordance,
	readCovered,
	readStates,
} from '../support/affordance'
import { violationsSevere } from '../support/axe'
import { sessionOf } from '../support/direct-edit-e2e'
import { testPayload } from '../support/payload-test'
import { createContent, deleteContent, refreshProfilePages } from '../support/public-pages'

/**
 * Everything that is hovered and clicked says so (issue 1068), at 1440 px with a mouse: each clickable element
 * (`a[href]`, `button`, `[role=button]`, `summary`, `select`, a box, a radio, a file field and the label of one)
 * shows the hand; none that is not clickable does; a disabled one shows « not allowed ». Each way of drawing a
 * clickable element also changes on hover, shows a ring on keyboard focus and changes while it is pressed.
 *
 * Out of scope: the frame of the Cloudflare Turnstile widget (a third party) and the Payload administration.
 * `AFFORDANCE_REPORT=1` prints the count of clickable elements read on each page (the report of the pull request).
 */

const PUBLIC_PAGES = [
	'/',
	'/search',
	'/search?city=Paris',
	'/search?search=mariage',
	'/classement',
	'/contact',
	'/auth/signin',
	'/auth/signup',
	'/auth/mot-de-passe-oublie',
	'/mentions-legales',
	'/cgu',
	'/politique-de-confidentialite',
	'/a-propos',
	'/site-map',
	'/une-page-qui-n-existe-pas',
] as const

/** The screens of her space, signed in as an artist whose page is complete. */
const SPACE_PAGES = ['/auth', '/auth/profil', '/auth/apercu-profil', '/auth/apercu-profil?mode=edition'] as const

interface PageReading {
	path: string
	items: AffordanceItem[]
}

async function read(page: Page, path: string): Promise<PageReading> {
	await page.goto(path, { waitUntil: 'load' })
	await freezeMotion(page)
	return { path, items: await page.evaluate(readAffordance) }
}

/** The pages that hold data (a profile, a talent, an article, a zone) are read from the sitemap of the bench. */
async function dataPages(page: Page): Promise<string[]> {
	const body = await (await page.request.get('/sitemap.xml')).text()
	const paths = [...body.matchAll(/<loc>https?:\/\/[^/<]+([^<]*)<\/loc>/g)].map(match => match[1] ?? '')
	const first = (prefix: string): string => {
		const found = paths.find(path => path.startsWith(prefix) && path.length > prefix.length)
		if (!found) throw new Error(`Le sitemap du banc n’a aucune adresse en « ${prefix} »`)
		return found
	}
	return [first('/profil/'), first('/talent/'), '/blog', first('/blog/'), first('/maquilleuses/')]
}

/**
 * The states of each way of drawing a clickable element of the open page (one element per signature): a hover, a
 * ring on keyboard focus, a change while pressed. Two things need no state of their own: the skip link is
 * seen only on focus, and a label is not a tab stop (the box it holds is the one that is focused).
 */
async function stateFailures(page: Page, path: string, seen: Set<string>): Promise<string[]> {
	const failures: string[] = []
	const items = await page.evaluate(readAffordance)
	for (const covered of await page.evaluate(readCovered)) failures.push(`${path} : ${covered}`)
	for (const item of items) {
		if ((item.role !== 'clickable' && item.role !== 'inert') || seen.has(item.signature)) continue
		seen.add(item.signature)
		const states = await readStates(page, item.index)
		if (!states) continue
		// A control that its component declares dead shows nothing that says « click me ».
		if (item.role === 'inert') {
			if (states.hover) failures.push(`${path} : un contrôle inerte change au survol : ${describe(item)}`)
			if (states.active) failures.push(`${path} : un contrôle inerte change à l’appui : ${describe(item)}`)
			continue
		}
		const skipLink = item.signature.includes('sr-only')
		if (!states.hover && !skipLink) failures.push(`${path} : pas de survol : ${describe(item)}`)
		if (!states.focus && item.why !== 'label')
			failures.push(`${path} : pas de contour au focus clavier : ${describe(item)}`)
		if (states.ringContrast !== null && states.ringContrast < 3)
			failures.push(
				`${path} : contour au focus trop pâle (${states.ringContrast.toFixed(1)}:1, 3:1 demandé) : ${describe(item)}`
			)
		if (!states.active && !skipLink) failures.push(`${path} : pas d’état actif : ${describe(item)}`)
	}
	return failures
}

const describe = (item: AffordanceItem): string => `${item.selector} « ${item.text} »`

test.describe('interactions : curseur, survol, focus et état actif (1068)', () => {
	test.describe.configure({ mode: 'serial', timeout: 600_000 })

	const readings: PageReading[] = []
	const created: { collection: 'talents' | 'articles'; id: number }[] = []

	test.beforeAll(async ({ browser, baseURL }) => {
		test.setTimeout(600_000)
		if (!baseURL) throw new Error('baseURL manque')
		const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } })
		const page = await context.newPage()
		const request = context.request
		const profiles = await setSearchProfiles()
		const [anyProfile] = [...profiles.values()]
		if (!anyProfile) throw new Error('le banc n’a aucun profil de recherche')
		await refreshProfilePages(request, anyProfile)
		const suffix = Date.now().toString(36)
		created.push({
			collection: 'talents',
			id: await createContent(request, 'talents', {
				title: 'Essai interactions talent',
				slug: `essai-interactions-talent-${suffix}`,
				_status: 'published',
			}),
		})
		created.push({
			collection: 'articles',
			id: await createContent(request, 'articles', {
				title: 'Essai interactions article',
				slug: `essai-interactions-article-${suffix}`,
				_status: 'published',
			}),
		})
		for (const path of [...PUBLIC_PAGES, ...(await dataPages(page))]) readings.push(await read(page, path))
		await context.close()
	})

	test.afterAll(async ({ request }) => {
		for (const { collection, id } of created.splice(0)) await deleteContent(request, collection, id)
	})

	test('chaque élément cliquable des pages publiques montre la main, aucun autre', async () => {
		const failures = readings.flatMap(({ path, items }) =>
			items.flatMap(item => {
				const defect = affordanceDefect(item)
				return defect ? [`${path} : ${defect} : ${describe(item)}`] : []
			})
		)
		if (process.env.AFFORDANCE_REPORT)
			for (const { path, items } of readings)
				console.log(
					`affordance ${path} : ${items.filter(item => item.role === 'clickable').length} cliquables, ${items.filter(item => item.role === 'inert').length} inertes, ${items.filter(item => affordanceDefect(item)).length} écarts`
				)
		expect(readings.length).toBeGreaterThanOrEqual(PUBLIC_PAGES.length + 5)
		for (const { path, items } of readings)
			expect(
				items.filter(item => item.role === 'clickable').length,
				`${path} : aucun élément cliquable lu`
			).toBeGreaterThan(0)
		expect(failures).toEqual([])
	})

	test('chaque façon de dessiner un élément cliquable change au survol, au focus clavier et à l’appui', async ({
		page,
	}) => {
		const failures: string[] = []
		// One element per way of drawing, across all the pages: the same classes are the same look.
		const drawn = new Set<string>()
		for (const { path } of readings) {
			await page.goto(path, { waitUntil: 'load' })
			await freezeMotion(page)
			failures.push(...(await stateFailures(page, path, drawn)))
		}
		expect(failures).toEqual([])
	})

	test('les écrans de l’espace de la maquilleuse : la main, le survol, le focus et l’appui', async ({
		browser,
		baseURL,
	}) => {
		if (!baseURL) throw new Error('baseURL manque')
		// A profile of her own, complete (name, zone, photos, prices), and her session: made-up people only.
		const letters = Math.random()
			.toString(36)
			.replace(/[^a-z]/g, '')
			.slice(0, 6)
		const type = pageProfilesUnderPrefix(`Interaction${letters}`).get('reference')
		if (!type) throw new Error('profil d’essai « reference » manquant')
		const profile = (await setPageProfiles(new Map([['reference', type]]))).get('reference')
		if (!profile) throw new Error('profil d’essai « reference » non créé')
		const session = await sessionOf(profile)
		const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } })
		await context.addCookies(session.cookies)
		const page = await context.newPage()
		const failures: string[] = []
		const drawn = new Set<string>()
		for (const path of SPACE_PAGES) {
			const { items } = await read(page, path)
			expect(
				items.filter(item => item.role === 'clickable').length,
				`${path} : aucun élément cliquable lu`
			).toBeGreaterThan(0)
			for (const item of items) {
				const defect = affordanceDefect(item)
				if (defect) failures.push(`${path} : ${defect} : ${describe(item)}`)
			}
			if (process.env.AFFORDANCE_REPORT)
				console.log(
					`affordance ${path} : ${items.filter(item => item.role === 'clickable').length} cliquables, ${items.filter(item => item.role === 'inert').length} inertes, ${items.filter(item => affordanceDefect(item)).length} écarts`
				)
			failures.push(...(await stateFailures(page, path, drawn)))
		}
		await context.close()
		const payload = await testPayload()
		const sheet = await payload.findByID({ collection: 'profiles', id: profile.id, depth: 0, select: { pro: true } })
		await payload.delete({ collection: 'profiles', id: profile.id }).catch(() => undefined)
		const pro = typeof sheet.pro === 'object' ? sheet.pro.id : sheet.pro
		if (pro !== undefined && pro !== null) await payload.delete({ collection: 'pros', id: pro }).catch(() => undefined)
		expect(failures).toEqual([])
	})

	test('un contrôle désactivé montre « interdit », un texte simple garde la flèche, une case et son libellé la main', async ({
		page,
	}) => {
		await page.goto('/contact', { waitUntil: 'load' })
		await page.evaluate(() => {
			document.body.insertAdjacentHTML(
				'beforeend',
				`<div id="planted">
					<button id="p-disabled" type="button" disabled>Désactivé</button>
					<button id="p-aria" type="button" aria-disabled="true">Désactivé par aria</button>
					<p id="p-text">Un texte simple</p>
					<label id="p-label"><input id="p-box" type="checkbox">Une case</label>
					<label id="p-label-disabled"><input type="checkbox" disabled>Une case désactivée</label>
					<input id="p-text-field" type="text" aria-label="Un champ">
					<a id="p-link" href="/">Un lien</a>
					<details><summary id="p-summary">Un résumé</summary>x</details>
				</div>`
			)
		})
		const cursorOf = (id: string) => page.locator(`#${id}`).evaluate(element => getComputedStyle(element).cursor)
		expect(await cursorOf('p-disabled')).toBe('not-allowed')
		expect(await cursorOf('p-aria')).toBe('not-allowed')
		expect(await cursorOf('p-text')).toBe('auto')
		expect(await cursorOf('p-label')).toBe('pointer')
		expect(await cursorOf('p-box')).toBe('pointer')
		expect(await cursorOf('p-label-disabled')).toBe('not-allowed')
		expect(await cursorOf('p-text-field')).toBe('text')
		expect(await cursorOf('p-link')).toBe('pointer')
		expect(await cursorOf('p-summary')).toBe('pointer')
	})

	test('le contrôle sait échouer : un bouton sans main, un texte avec la main, un désactivé sans « interdit »', async ({
		page,
	}) => {
		await page.setContent(`<!doctype html><html lang="fr"><body>
			<button id="a" style="cursor:default">Sans main</button>
			<div id="b" style="cursor:pointer">Texte avec la main</div>
			<button id="c" disabled style="cursor:pointer">Désactivé</button>
			<a id="d" href="/" style="cursor:pointer"><span>Dans un lien</span></a>
			<button id="e" style="cursor:pointer">Bon</button>
		</body></html>`)
		const items = await page.evaluate(readAffordance)
		const wrong = items.filter(item => affordanceDefect(item)).map(item => item.selector)
		expect(wrong.sort()).toEqual(['button#a', 'button#c', 'div#b'])
		expect(items.find(item => item.selector === 'div#b')?.role).toBe('plain')
		expect(items.filter(item => item.role === 'clickable')).toHaveLength(3)
	})
})

test.describe('interactions au tactile (1068)', () => {
	test('@mobile les contrôles restent à 44 px et lisibles sans survol, sans défilement de côté', {
		tag: '@mobile',
	}, async ({ page }) => {
		for (const path of ['/contact', '/auth/signin', '/auth/signup', '/auth/mot-de-passe-oublie', '/search']) {
			await page.goto(path, { waitUntil: 'load' })
			expect(
				await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
				`${path} : défilement horizontal`
			).toBeLessThanOrEqual(0)
			const small = await page.evaluate(() =>
				[
					...document.querySelectorAll<HTMLElement>(
						'main button, main select, main input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])'
					),
				]
					.filter(element => {
						// A trap field for robots is out of the screen and of the tab order: nobody presses it.
						if (element.closest('[aria-hidden="true"]') || element.tabIndex < 0) return false
						const box = element.getBoundingClientRect()
						return box.width > 0 && box.height > 0 && box.height < 44
					})
					.map(
						element =>
							`${element.tagName} ${element.getAttribute('type') ?? ''} ${element.id} ${(element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 40)}`
					)
			)
			expect(small, `${path} : cibles de moins de 44 px`).toEqual([])
			// A link in a text line is underlined without a hover: the touch screen has none.
			const flat = await page.evaluate(() =>
				[...document.querySelectorAll<HTMLElement>('main p a[href]')]
					.filter(
						link => getComputedStyle(link).textDecorationLine === 'none' && getComputedStyle(link).fontWeight < '600'
					)
					.map(link => link.textContent?.trim().slice(0, 40) ?? '')
			)
			expect(flat, `${path} : lien de texte sans soulignement ni graisse`).toEqual([])
			expect(await violationsSevere(page), `${path} : axe`).toEqual([])
		}
	})
})

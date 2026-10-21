import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test } from '@playwright/test'

/**
 * Ticket 271: no page of the site is shown inside the frame of another site (clickjacking), and a
 * frame of the same origin still works. The other site is a throwaway server of this test on another
 * port of the loopback interface, so another origin; nothing is sent outside the machine.
 */

const SIGN_IN = '/auth/signin'

test('a page of another origin cannot show the sign-in page in a frame', async ({ baseURL, page }) => {
	if (!baseURL) throw new Error('baseURL is missing')
	const target = new URL(SIGN_IN, baseURL).href
	const other = createServer((_request, response) => {
		response.setHeader('content-type', 'text/html; charset=utf-8')
		response.end(`<!doctype html><title>Autre site</title><iframe id="cadre" src="${target}"></iframe>`)
	})
	await new Promise<void>(resolve => other.listen(0, '127.0.0.1', resolve))
	try {
		const { port } = other.address() as AddressInfo
		expect(String(port)).not.toBe(new URL(baseURL).port)
		await page.goto(`http://127.0.0.1:${port}/`)
		const frame = page.frameLocator('#cadre')
		// The browser replaces a refused frame by its own error page: the sign-in form never shows.
		await expect.poll(() => page.frames().some(f => f.url().startsWith('chrome-error:'))).toBe(true)
		await expect(frame.locator('input[type="email"], input[name="email"]')).toHaveCount(0)
	} finally {
		await new Promise(resolve => other.close(resolve))
	}
})

test('a page of the same origin can still show a page of the site in a frame', async ({ page }) => {
	await page.goto('/robots.txt')
	await page.evaluate(src => {
		const cadre = document.createElement('iframe')
		cadre.id = 'cadre'
		cadre.src = src
		document.body.append(cadre)
	}, SIGN_IN)
	await expect.poll(() => page.frames().filter(f => f.url().endsWith(SIGN_IN)).length).toBe(1)
	expect(page.frames().some(f => f.url().startsWith('chrome-error:'))).toBe(false)
	// Same origin: the parent reads the framed document.
	await expect
		.poll(() => page.evaluate(() => document.querySelector('iframe')?.contentDocument?.title ?? ''))
		.not.toBe('')
})

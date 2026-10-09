// The Next image optimizer runs on sharp (URG-11: sharp 0.35.5 for the
// libvips advisories). The pictures of the fake Strapi come from a host that
// remotePatterns refuses, so the other specs never reach sharp: here the
// hero of the public pages and the shared picture, both in /public, go
// through /_next/image. The image cache of the test build is emptied first,
// so each answer is made now (x-nextjs-cache MISS). Without a working sharp,
// Next sends the original back: 1024 px, the JPEG itself, or the very bytes
// of the file.

import { readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const APP = process.env.RG_APP ?? 'http://localhost:3996'

// Never against the production: local hosts only
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(APP).hostname))
	throw new Error(`cible non locale refusée : ${APP}`)

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
// DIST of tests/regression/run.mjs; next build keeps its cache folder
const CACHE_IMAGES = path.join(RACINE, '.next-test-regression/cache/images')
const LARGEUR = 640

/** Width of a WebP read from its header (VP8, VP8L or VP8X), null if not WebP. */
function largeurWebp(octets) {
	const b = Buffer.from(octets)
	if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null
	const bloc = b.toString('ascii', 12, 16)
	if (bloc === 'VP8 ') return b.readUInt16LE(26) & 0x3fff
	if (bloc === 'VP8L') return 1 + (((b[22] & 0x3f) << 8) | b[21])
	if (bloc === 'VP8X') return 1 + b.readUIntLE(24, 3)
	return null
}

test.beforeAll(() => {
	rmSync(CACHE_IMAGES, { recursive: true, force: true })
})

for (const source of ['/assets/back.webp', '/assets/og-my-makeup.jpg']) {
	test(`/_next/image : ${source} redimensionnée en WebP de ${LARGEUR} px`, async ({ request }) => {
		const reponse = await request.get(`/_next/image?url=${encodeURIComponent(source)}&w=${LARGEUR}&q=75`, {
			headers: { Accept: 'image/avif,image/webp,*/*' },
		})
		expect(reponse.status()).toBe(200)
		expect(reponse.headers()['x-nextjs-cache']).toBe('MISS')
		expect(reponse.headers()['content-type']).toBe('image/webp')
		expect(largeurWebp(await reponse.body())).toBe(LARGEUR)
	})
}

// The hero asks for 1080 px (2048 on a 2x screen) of a 1024 px WebP: sharp
// does not enlarge it, so only the bytes tell its WebP from the original
test('accueil : l’image du hero est réencodée par sharp et s’affiche', async ({ page }) => {
	const original = readFileSync(path.join(RACINE, 'public/assets/back.webp'))
	const reponseHero = page.waitForResponse(r => r.url().includes('/_next/image?') && r.url().includes('back.webp'))
	await page.goto('/')
	const reponse = await reponseHero
	const demandee = Number(new URL(reponse.url()).searchParams.get('w'))
	expect(reponse.status()).toBe(200)
	expect(reponse.headers()['content-type']).toBe('image/webp')
	const corps = await reponse.body()
	expect(corps.equals(original), 'le fichier d’origine, sans sharp').toBe(false)
	expect(largeurWebp(corps)).toBe(Math.min(demandee, largeurWebp(original)))
	const hero = page.locator('img[src*="back.webp"]').first()
	await expect(hero).toHaveAttribute('src', /\/_next\/image\?/)
	await expect.poll(() => hero.evaluate(img => img.complete && img.naturalWidth)).toBeGreaterThan(0)
})

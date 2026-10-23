import { SITE_ORIGIN } from '../../src/lib/frozen-urls'
import { indexNowKey, sitemapUrls, submitToIndexNow } from '../../src/lib/seo/indexnow'

/**
 * Tells IndexNow about every address of the sitemap of the site (ticket 219, the step « envoi des adresses »
 * of the day of the switch, docs/seo/indexnow.md):
 *
 *   INDEXNOW_KEY=<la clé> bun --no-env-file scripts/seo/indexnow-all.ts
 *
 * It reads the live sitemap of the main host and sends what it lists, in one request per 10 000
 * addresses. The key is read from the variable only (never from a file), and never printed.
 */
const key = indexNowKey()
if (key === undefined) {
	console.error('INDEXNOW_KEY absente ou illisible : 32 caractères hexadécimaux en minuscules.')
	process.exit(1)
}

const response = await fetch(`${SITE_ORIGIN}/sitemap.xml`, { signal: AbortSignal.timeout(30_000) })
if (!response.ok) {
	console.error(`Le sitemap répond ${response.status} : rien n’est envoyé.`)
	process.exit(1)
}
const addresses = sitemapUrls(await response.text())
if (addresses.length === 0) {
	console.error('Le sitemap ne liste aucune adresse : rien n’est envoyé.')
	process.exit(1)
}
await submitToIndexNow(addresses, key)
console.log(`${addresses.length} adresses envoyées à IndexNow.`)

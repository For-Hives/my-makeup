import { adressesDuSitemap, cleIndexNow, envoyerAIndexNow } from '../../src/lib/seo/indexnow'
import { SITE_ORIGIN } from '../../src/lib/frozen-urls'

/**
 * Tells IndexNow about every address of the sitemap of the site (ticket 219, the step « envoi des adresses »
 * of the day of the switch, docs/seo/indexnow.md):
 *
 *   INDEXNOW_KEY=<la clé> bun --no-env-file scripts/seo/indexnow-tout.ts
 *
 * It reads the live sitemap of the main host and sends what it lists, in one request per 10 000
 * addresses. The key is read from the variable only (never from a file), and never printed.
 */
const cle = cleIndexNow()
if (cle === undefined) {
	console.error('INDEXNOW_KEY absente ou illisible : 32 caractères hexadécimaux en minuscules.')
	process.exit(1)
}

const reponse = await fetch(`${SITE_ORIGIN}/sitemap.xml`, { signal: AbortSignal.timeout(30_000) })
if (!reponse.ok) {
	console.error(`Le sitemap répond ${reponse.status} : rien n’est envoyé.`)
	process.exit(1)
}
const adresses = adressesDuSitemap(await reponse.text())
if (adresses.length === 0) {
	console.error('Le sitemap ne liste aucune adresse : rien n’est envoyé.')
	process.exit(1)
}
await envoyerAIndexNow(adresses, cle)
console.log(`${adresses.length} adresses envoyées à IndexNow.`)

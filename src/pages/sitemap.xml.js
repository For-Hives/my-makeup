import { devisFormUrl } from '@/lib/devis'
import { entreesSitemap, PAGES_STATIQUES, sitemapXml } from '@/lib/seo/sitemap'
import { urlDuSite } from '@/lib/seo/url'
import {
	chargerProfilsDuSitemap,
	listerArticles,
	listerTalents,
} from '@/services/profilsPublics'

/**
 * /sitemap.xml (SEO-10): the fixed pages, every publiable profile by its
 * slug, every talent and article, all pages of the API read (no more cut at
 * 25), lastmod = updatedAt. Built on each request; an API error gives a 500
 * rather than a sitemap with missing URLs.
 */
const Sitemap = () => null

export const getServerSideProps = async ({ res }) => {
	const formulaireDevis =
		devisFormUrl(process.env.NEXT_PUBLIC_DEVIS_FORM_URL) !== null
	const [profils, talents, articles] = await Promise.all([
		chargerProfilsDuSitemap({ formulaireDevis }),
		listerTalents(),
		listerArticles(),
	])

	res.setHeader('Content-Type', 'application/xml; charset=utf-8')
	res.write(
		sitemapXml(
			entreesSitemap({
				site: urlDuSite(),
				pages: PAGES_STATIQUES,
				profils,
				talents,
				articles,
			})
		)
	)
	res.end()

	return { props: {} }
}

export default Sitemap

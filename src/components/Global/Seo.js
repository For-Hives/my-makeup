import Head from 'next/head'
import { avecCles } from '@/lib/cles'
import { balisesMeta, serialiserJsonLd } from '@/lib/seo/meta'

/**
 * <head> of a public page (SEO-10, SEO-12): title, description, canonical
 * (indexed pages only), robots, Open Graph, Twitter and JSON-LD, all
 * computed by src/lib/seo/meta.js from the page props, so the server HTML
 * already holds them.
 * @param {{seo: import('@/lib/seo/meta').Seo}} props
 */
export default function Seo({ seo }) {
	return (
		<Head>
			<title>{seo.titre}</title>
			{balisesMeta(seo).map(balise =>
				balise.nom ? (
					<meta key={balise.cle} name={balise.nom} content={balise.contenu} />
				) : (
					<meta key={balise.cle} property={balise.propriete} content={balise.contenu} />
				)
			)}
			{seo.indexable && <link key="canonical" rel="canonical" href={seo.url} />}
			{avecCles(seo.jsonLd ?? []).map(({ valeur: donnees, cle }, _i) => (
				<script key={cle} type="application/ld+json" dangerouslySetInnerHTML={{ __html: serialiserJsonLd(donnees) }} />
			))}
		</Head>
	)
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { Cta } from '@/components/blocks/Cta'
import { Hero } from '@/components/blocks/Hero'
import { pageMetadata } from '@/lib/seo/metadata'
import { deliveredStaticPages, SITE_MAP_GROUPS } from '@/lib/seo/sitemap'
import { cheminProfil } from '@/lib/slug'
import { cachedIndexablePages } from '@/services/public/cached'

// Read at each request: the build runs without a database. The reading is the one of the sitemap, kept in
// Next's cache and refreshed by a save of a profile, a talent or an article (ticket 047).
export const dynamic = 'force-dynamic'

export const metadata: Metadata = pageMetadata({
	titre: 'Plan du site',
	description: 'Le plan du site de My-Makeup',
	repli:
		'Le plan du site My-Makeup : toutes les pages du site, les articles, les spécialités et les maquilleuses à découvrir.',
	chemin: '/site-map',
})

/**
 * The plan of the site (ticket 114): the fixed pages of the table the sitemap reads, then the articles, the
 * talents and the publishable profiles, each by the address the sitemap lists for it. The profile links are
 * the only links of the site to the profiles that a crawler reads without running JavaScript.
 */
export default async function SiteMapPage() {
	const { profils: profiles, talents, articles } = await cachedIndexablePages()
	const pages = deliveredStaticPages()
	// Her name, then her slug when two share a name.
	const byName = [...profiles].sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.slug.localeCompare(b.slug))
	return (
		<main className="relative">
			<Hero
				image="/assets/back/maquilleuse_europeenne_white.webp"
				titre={
					<>
						Le plan du site&nbsp;<span className="text-indigo-900">My&nbsp;Makeup</span>
					</>
				}
				description="La globalité de toutes les pages qui sont présentes dans l'arborescence du site !"
				recherche={false}
			/>
			<div className="relative mx-auto my-24 max-w-7xl px-4 md:my-48 md:px-0">
				<div className="mx-auto max-w-2xl">
					<article>
						<header className="flex flex-col">
							<h2 className="mt-6 font-bold text-3xl text-gray-800 tracking-tight sm:text-4xl">
								My-Makeup la plateforme pour les maquilleuses !
							</h2>
						</header>
						<div className="prose xl:prose-lg my-8">
							{SITE_MAP_GROUPS.map(groupe => (
								<section key={groupe.id}>
									<h3>{groupe.titre}</h3>
									<ul>
										{pages
											.filter(page => page.groupe === groupe.id)
											.map(page => (
												<li key={page.chemin}>
													<Link href={page.chemin}>{page.titre}</Link>
												</li>
											))}
									</ul>
								</section>
							))}
							{articles.length > 0 && (
								<section>
									<h3>Blog</h3>
									<ul>
										{articles.map(article => (
											<li key={article.slug}>
												<Link href={`/blog/${article.slug}`}>{article.titre}</Link>
											</li>
										))}
									</ul>
								</section>
							)}
							{talents.length > 0 && (
								<section>
									<h3>Talents</h3>
									<ul>
										{talents.map(talent => (
											<li key={talent.slug}>
												<Link href={`/talent/${talent.slug}`}>{talent.titre}</Link>
											</li>
										))}
									</ul>
								</section>
							)}
							{byName.length > 0 && (
								<section>
									<h3>Maquilleuses</h3>
									<ul data-testid="plan-des-profils">
										{byName.map(profil => (
											// No prefetch: a visit of this page must not render every profile.
											<li key={profil.slug}>
												<Link href={cheminProfil(profil.slug)} prefetch={false}>
													{profil.nom}
												</Link>
											</li>
										))}
									</ul>
								</section>
							)}
						</div>
					</article>
				</div>
			</div>
			<Cta />
		</main>
	)
}

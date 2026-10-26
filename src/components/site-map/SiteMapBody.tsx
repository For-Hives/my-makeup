import Link from 'next/link'
import { TitleAccent } from '@/components/art/TitleWithCapsules'
import { Cta } from '@/components/blocks/Cta'
import { ArticleHeading, ArtPage } from '@/components/static-pages/ArtPage'
import { PageHead } from '@/components/static-pages/PageHead'
import { deliveredStaticPages, SITE_MAP_GROUPS } from '@/lib/seo/sitemap'
import { zoneLabel } from '@/lib/seo/zone-page'
import { zonePath } from '@/lib/seo/zones'
import { profilePath } from '@/lib/slug'
import type { IndexablePages } from '@/services/public/indexable-pages'

/**
 * The body of the plan of the site (ticket 114): the fixed pages of the table the sitemap reads, then the
 * articles, the talents, the zones that have the threshold (ticket 1015) and the publishable profiles, each by the
 * address the sitemap lists for it. The profile
 * links are the only links of the site to the profiles that a crawler reads without running JavaScript.
 * Apart from the page so that a test renders it with fictional pages, without Next's cache (ticket 299).
 */
export function SiteMapBody({ profils: profiles, zones, talents, articles }: IndexablePages) {
	const pages = deliveredStaticPages()
	// Her name, then her slug when two share a name.
	const byName = [...profiles].sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.slug.localeCompare(b.slug))
	return (
		<ArtPage>
			<PageHead
				image="/assets/back/maquilleuse_europeenne_white.webp"
				title={
					<>
						Le plan du site&nbsp;<TitleAccent>My&nbsp;Makeup</TitleAccent>
					</>
				}
				description="La globalité de toutes les pages qui sont présentes dans l'arborescence du site !"
			/>
			<div className="relative mx-auto max-w-5xl px-6 pb-24">
				<div className="rounded-art-frame bg-white px-6 py-10 sm:px-12 sm:py-14">
					<article>
						<ArticleHeading title="My-Makeup la plateforme pour les maquilleuses !" />
						{/* Every link of the plan is a target of 44 px at least (ticket 299). */}
						<div className="mt-10 columns-1 gap-12 sm:columns-2 [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_a]:text-indigo-800 [&_a]:underline-offset-4 [&_a:hover]:text-indigo-950 [&_a:hover]:underline [&_h3]:mb-2 [&_h3]:font-display [&_h3]:font-medium [&_h3]:text-2xl [&_h3]:text-ink [&_section]:mb-10 [&_section]:break-inside-avoid [&_ul]:list-none [&_ul]:p-0">
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
							{zones.length > 0 && (
								<section>
									<h3>Maquilleuses par département</h3>
									<ul data-testid="plan-des-zones">
										{zones.map(zone => (
											<li key={zone.code}>
												<Link href={zonePath(zone.code)}>{zoneLabel(zone.code)}</Link>
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
												<Link href={profilePath(profil.slug)} prefetch={false}>
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
		</ArtPage>
	)
}

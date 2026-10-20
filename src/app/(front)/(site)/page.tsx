import type { Metadata } from 'next'
import { Collaboration } from '@/components/home/Collaboration'
import { Presentation } from '@/components/home/Presentation'
import { Project } from '@/components/home/Project'
import { Talents } from '@/components/home/Talents'
import { Cta } from '@/components/blocks/Cta'
import { Hero } from '@/components/blocks/Hero'
import { RESEAUX } from '@/components/layout/links'
import { donneesStructureesDeLAccueil, serializeJsonLd } from '@/lib/seo/json-ld'
import { metadonnees } from '@/lib/seo/metadata'
import { cachedTalents } from '@/services/public/cached'
import type { TalentPublic } from '@/services/public/talents'

// Rendered at each request: the build runs without a database. The talents are read through the cache of
// Next, tagged `talents`: a save of a talent in the admin panel refreshes them (tickets 047 and 117), and
// a visit of a page that did not change reads nothing in the database.
export const dynamic = 'force-dynamic'

const TITRE = 'Maquilleuse professionnelle près de chez vous'
const DESCRIPTION =
	'Trouvez une maquilleuse professionnelle à domicile près de chez vous, pour un mariage, une soirée ou un shooting. Comparez les profils et les tarifs.'

// The preview of a shared link comes with the other tags: the picture of the site (ticket 116).
export const metadata: Metadata = metadonnees({
	titre: TITRE,
	description: DESCRIPTION,
	repli:
		'Annuaire de maquilleuses professionnelles indépendantes : trouvez celle qui vous correspond, près de chez vous.',
	chemin: '/',
})

const RESEAUX_PUBLICS = RESEAUX.filter(({ href }) => href.startsWith('https://')).map(({ href }) => href)

/** The talents, or none when the database does not answer: the home page stays a page, never a 500. */
async function lireLesTalents(): Promise<readonly TalentPublic[]> {
	try {
		return await cachedTalents()
	} catch (erreur) {
		console.error('[accueil] les talents ne se lisent pas :', erreur instanceof Error ? erreur.message : erreur)
		return []
	}
}

export default async function PageDAccueil() {
	const talents = await lireLesTalents()
	return (
		<main className="relative">
			<script
				type="application/ld+json"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: serializeJsonLd escapes <, > and &, so the data cannot close the tag.
				dangerouslySetInnerHTML={{ __html: serializeJsonLd(donneesStructureesDeLAccueil(RESEAUX_PUBLICS)) }}
			/>
			<Hero
				titre={<>Trouver la maquilleuse qui vous correspond n&apos;a jamais été aussi simple</>}
				description={
					<>
						Trouvez la maquilleuse spécialisée dans le domaine que vous recherchez, maquillage pour les mariées,
						maquillage de soirée, maquillage professionnel...
					</>
				}
			/>
			<Presentation />
			{talents.length > 0 && <Talents talents={talents} />}
			<Collaboration />
			<Project />
			<Cta />
		</main>
	)
}

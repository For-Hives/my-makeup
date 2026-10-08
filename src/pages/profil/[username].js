import React from 'react'
import Footer from '@/components/Global/Footer'
import ViewResumeProfil from '@/components/Profil/Parents/ViewResumeProfil'
import ViewInfosProfil from '@/components/Profil/Parents/ViewInfosProfil'
import Nav from '@/components/Global/Nav'
import Seo from '@/components/Global/Seo'
import { devisFormUrl } from '@/lib/devis'
import { cheminProfil, resoudreProfil } from '@/lib/slug'
import { seoProfil } from '@/lib/seo/meta'
import { urlDuSite } from '@/lib/seo/url'
import { chargerProfil, chargerTableDesSlugs } from '@/services/profilsPublics'

/**
 * Public profile, /profil/<slug> (UI-06, SEO-10): rendered on the server
 * (ISR), noindex unless publiable (src/lib/profil/completude.js), 308 from
 * the old URL (raw username, with spaces or capitals) to the slug.
 */
export default function Profil({ profilData, slug, devisUrl = null }) {
	const seo = seoProfil({
		profil: profilData,
		slug,
		site: urlDuSite(),
		apiBase: process.env.NEXT_PUBLIC_API_URL,
		formulaireDevis: devisUrl !== null,
	})
	return (
		<>
			<Seo seo={seo} />
			<Nav />
			<main className={'relative'}>
				<ViewResumeProfil
					user={profilData}
					isPublicView={true}
					devisUrl={devisUrl}
					slug={slug}
				/>
				<ViewInfosProfil user={profilData} isPublicView={true} />
			</main>
			<Footer />
		</>
	)
}

// Nothing generated at build time: each profile is rendered on its first
// visit then kept and regenerated every 10 s (ISR). The build does not
// depend on the API, and the slugs are computed on the current list.
export async function getStaticPaths() {
	return { paths: [], fallback: 'blocking' }
}

export async function getStaticProps({ params }) {
	// throws if the API is unreachable or answers an error (see fetchPublicApi)
	const table = await chargerTableDesSlugs()
	const trouve = resoudreProfil(params.username, table)

	if (!trouve) {
		return { notFound: true, revalidate: 10 }
	}

	if (trouve.redirection) {
		// old URL (username): one 308 to the slug
		return {
			redirect: { destination: cheminProfil(trouve.slug), permanent: true },
			revalidate: 10,
		}
	}

	const profilData = await chargerProfil(trouve.profil.username)

	if (!profilData) {
		return { notFound: true, revalidate: 10 }
	}

	return {
		props: {
			profilData,
			slug: trouve.slug,
			// quote form (F3a): read here, on the server, and passed as a prop so
			// the server HTML and the browser agree. Inlined when set at build
			// time, read at runtime otherwise (picked up as profiles regenerate).
			devisUrl: devisFormUrl(process.env.NEXT_PUBLIC_DEVIS_FORM_URL),
		},
		revalidate: 10,
	}
}

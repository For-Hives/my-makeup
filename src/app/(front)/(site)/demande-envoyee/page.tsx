import type { Metadata } from 'next'
import Link from 'next/link'
import { Hero } from '@/components/blocks/Hero'
import { metadonnees } from '@/lib/seo/metadonnees'

// The thank-you page: a page, but not one to find in a search engine. No canonical address, `noindex`.
export const metadata: Metadata = metadonnees({
	titre: 'Demande envoyée',
	description: 'Votre demande est transmise.',
	repli: 'Votre demande est transmise.',
	chemin: '/demande-envoyee',
	indexable: false,
})

export default function PageDemandeEnvoyee() {
	return (
		<main className="relative">
			<Hero
				titre="Votre demande est transmise"
				description="Vous recevrez une réponse sous 48 h. Merci de votre confiance !"
				recherche={false}
			/>
			<div className="mx-auto my-24 flex max-w-2xl flex-col items-center gap-8 px-4 text-center md:px-0">
				<p className="text-gray-700 text-lg">
					Nous transmettons votre demande à la maquilleuse. Si elle n&apos;est pas disponible, nous vous proposerons une
					autre maquilleuse de votre secteur, avec votre accord.
				</p>
				<Link href="/search" className="btn-primary">
					Voir d&apos;autres maquilleuses
				</Link>
			</div>
		</main>
	)
}

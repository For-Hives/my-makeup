import type { Metadata } from 'next'
import Link from 'next/link'
import { Hero } from '@/components/blocks/Hero'
import { ContentPage } from '@/components/static-pages/EditorialArticle'
import { CheckCircleIcon } from '@/components/static-pages/icons'
import { pageMetadata } from '@/lib/seo/metadata'

// The thank-you page: a page, but not one to find in a search engine. No canonical address, `noindex`.
export const metadata: Metadata = pageMetadata({
	titre: 'Demande envoyée',
	description: 'Votre demande est transmise.',
	repli: 'Votre demande est transmise.',
	chemin: '/demande-envoyee',
	indexable: false,
})

export default function RequestSentPage() {
	return (
		<ContentPage>
			<Hero
				titre="Votre demande est transmise"
				description="Vous recevrez une réponse sous 48 h. Merci de votre confiance !"
				recherche={false}
			/>
			<section className="border-gray-200 border-t bg-neutral-50 px-4 py-20 md:py-28">
				<div className="reveal mx-auto flex max-w-xl flex-col items-center gap-6 rounded-2xl border border-gray-200 bg-white p-8 text-center sm:p-12">
					<span className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50 text-indigo-900">
						<CheckCircleIcon className="h-8 w-8" />
					</span>
					<p className="max-w-[48ch] text-gray-700 text-lg leading-8">
						Nous transmettons votre demande à la maquilleuse. Si elle n&apos;est pas disponible, nous vous proposerons
						une autre maquilleuse de votre secteur, avec votre accord.
					</p>
					<Link href="/search" className="btn-primary">
						Voir d&apos;autres maquilleuses
					</Link>
				</div>
			</section>
		</ContentPage>
	)
}

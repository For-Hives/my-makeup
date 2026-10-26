import type { Metadata } from 'next'
import { ArchImage } from '@/components/art/ArchImage'
import { GlowBlob } from '@/components/art/graphics'
import { Pill } from '@/components/art/Pill'
import { ArtPage } from '@/components/static-pages/ArtPage'
import { PageHead } from '@/components/static-pages/PageHead'
import { pageMetadata } from '@/lib/seo/metadata'

// The thank-you page: a page, but not one to find in a search engine. No canonical address, `noindex`.
export const metadata: Metadata = pageMetadata({
	titre: 'Demande envoyée',
	description: 'Votre demande est transmise.',
	repli: 'Votre demande est transmise.',
	chemin: '/demande-envoyee',
	indexable: false,
})

/** A centred head, then one small arch (a slot for an illustration) beside the reassurance and a pill back to the search. */
export default function RequestSentPage() {
	return (
		<ArtPage>
			<PageHead
				layout="centered"
				glow="blush"
				drawing="lips"
				title="Votre demande est transmise"
				description="Vous recevrez une réponse sous 48 h. Merci de votre confiance !"
			/>
			<section className="relative isolate overflow-hidden px-6 pb-20 md:pb-32">
				<GlowBlob size="md" tone="indigo" className="-bottom-40 -left-60" />
				<div className="reveal relative mx-auto grid max-w-4xl items-center gap-10 rounded-art-frame border border-nude-200 bg-white p-8 sm:p-12 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)] md:gap-14">
					<div className="mx-auto w-full max-w-[180px] pr-3 md:max-w-none">
						{/* TODO(1136): illustration à générer (arche 4:5, ~220 px; intention: rassurance, une maquilleuse qui reçoit un message, ton doux) */}
						<ArchImage
							src="/assets/back/maquilleuse_metisse_white.webp"
							alt=""
							tint="blush"
							band="band"
							size="sm"
							mark={false}
							sizes="220px"
						/>
					</div>
					<div className="flex flex-col items-start gap-8">
						<p className="max-w-[48ch] text-lg text-mute leading-8">
							Nous transmettons votre demande à la maquilleuse. Si elle n&apos;est pas disponible, nous vous proposerons
							une autre maquilleuse de votre secteur, avec votre accord.
						</p>
						<Pill href="/search" variant="filled" arrow>
							Voir d&apos;autres maquilleuses
						</Pill>
					</div>
				</div>
			</section>
		</ArtPage>
	)
}

import type { Metadata } from 'next'
import { connection } from 'next/server'
import { GlowBlob, PrintMark } from '@/components/art/graphics'
import { Cta } from '@/components/blocks/Cta'
import { ContactForm } from '@/components/contact/ContactForm'
import { ArtEyebrow, ArtPage } from '@/components/static-pages/ArtPage'
import { PageHead } from '@/components/static-pages/PageHead'
import { serverEnv } from '@/lib/env'
import { pageMetadata } from '@/lib/seo/metadata'
import { sendMessage } from './actions'

export const metadata: Metadata = pageMetadata({
	titre: 'Contact - My-Makeup',
	description:
		"Contactez-nous pour toute question, suggestion ou collaboration ! L'équipe My-Makeup est à votre écoute !",
	repli: 'Contactez l’équipe My-Makeup pour toute question, suggestion ou collaboration.',
	chemin: '/contact',
})

/** The addresses of the team, as the live site lists them. No telephone number: see the register of intended changes (`contact-sans-telephone`). */
const CONTACT_DETAILS = [
	{ titre: 'Contact général', email: 'contact@my-makeup.fr' },
	{ titre: 'Travailler avec nous', email: 'jobs@my-makeup.fr' },
	{ titre: 'Relation entreprise', email: 'pro@my-makeup.fr' },
	{ titre: 'Aide et questions', email: 'help@my-makeup.fr' },
] as const

/**
 * Rendered on request: the site key of the widget is read when the server runs, not frozen into the build (ticket 1000).
 * Layout F of the kit, in its real-data version: a row of wordmarks becomes the four addresses of the team, in Bodoni, in two columns
 * separated by hairlines and print marks. The form sits in a white panel under a centred head.
 */
export default async function PageContact() {
	await connection()
	const siteKey = serverEnv().turnstile?.siteKey
	return (
		<ArtPage>
			<PageHead
				layout="centered"
				drawing="eye"
				glow="rose"
				title="Contact"
				description="Une idée, une envie de collaborer, une question ? N’hésitez pas à nous contacter !"
			/>
			<section className="px-4 pb-16 sm:px-6 md:pb-24">
				<div className="mx-auto max-w-3xl rounded-art-frame border border-nude-200 bg-white px-4 py-14 sm:px-10 md:py-20">
					<div className="reveal mx-auto max-w-2xl text-center">
						<h2 className="text-balance font-display font-medium text-3xl tracking-tight sm:text-4xl">
							Un message en particulier ?
						</h2>
						<p className="mx-auto mt-4 max-w-[56ch] text-lg text-mute leading-8">
							Une demande particulière, un bug, une idée ? N’hésitez pas à nous contacter via le formulaire ci-dessous !
						</p>
					</div>
					<ContactForm action={sendMessage} {...(siteKey !== undefined && { siteKey })} />
				</div>
			</section>
			<section className="relative isolate overflow-hidden border-nude-200 border-t px-4 py-20 sm:px-6 md:py-28">
				<GlowBlob size="lg" tone="blush" className="-right-96 top-0" />
				<div className="relative mx-auto grid max-w-6xl gap-12 lg:grid-cols-12 lg:gap-16">
					<div className="reveal lg:col-span-5">
						<ArtEyebrow>Contact</ArtEyebrow>
						<h2 className="mt-4 text-balance font-display font-medium text-3xl tracking-tight sm:text-4xl lg:text-[2.6rem] lg:leading-[1.1]">
							Contactez-nous
						</h2>
						<p className="mt-6 max-w-[40ch] text-lg text-mute leading-8">
							My-Makeup, plus qu’une plateforme de mise en relation, une équipe de passionnés à votre service !
						</p>
					</div>
					<ul className="grid list-none grid-cols-1 border-ink/20 border-t p-0 sm:grid-cols-2 lg:col-span-7">
						{CONTACT_DETAILS.map(({ titre, email }, index) => (
							<li
								key={email}
								className={`reveal relative flex flex-col gap-3 border-ink/20 border-b px-0 py-9 sm:px-8 ${index % 2 === 0 ? 'sm:border-r sm:pl-0' : ''}`}
							>
								{index === 1 && (
									<span aria-hidden="true" className="absolute top-3 right-0 text-indigo-700">
										<PrintMark kind="plus" className="h-4 w-4" />
									</span>
								)}
								<h3 className="font-semibold text-[13px] text-indigo-800 uppercase tracking-[0.14em]">{titre}</h3>
								<dl>
									<dt className="sr-only">Email</dt>
									<dd>
										<a
											className="inline-flex min-h-11 items-center break-all font-display font-medium text-2xl text-ink underline decoration-indigo-300 underline-offset-4 hover:text-indigo-800"
											href={`mailto:${email}`}
										>
											{email}
										</a>
									</dd>
								</dl>
							</li>
						))}
					</ul>
				</div>
			</section>
			<Cta />
		</ArtPage>
	)
}

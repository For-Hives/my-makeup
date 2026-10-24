import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Cta } from '@/components/blocks/Cta'
import { Hero } from '@/components/blocks/Hero'
import { ContactForm } from '@/components/contact/ContactForm'
import { ContentPage, Eyebrow } from '@/components/static-pages/EditorialArticle'
import { EnvelopeIcon } from '@/components/static-pages/icons'
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

/** Rendered on request: the site key of the widget is read when the server runs, not frozen into the build (ticket 1000). */
export default async function PageContact() {
	await connection()
	const siteKey = serverEnv().turnstile?.siteKey
	return (
		<ContentPage>
			<Hero
				image="/assets/back/maquilleuse_europeenne_white.webp"
				titre="Contact"
				description="Une idée, une envie de collaborer, une question ? N’hésitez pas à nous contacter !"
				recherche={false}
			/>
			<div className="reveal mx-auto mt-24 max-w-2xl px-4 text-center md:mt-32 md:px-0">
				<span aria-hidden="true" className="mx-auto mb-6 block h-0.5 w-12 bg-indigo-900" />
				<h2 className="font-display font-medium text-3xl text-balance text-gray-900 tracking-tight sm:text-4xl">
					Un message en particulier ?
				</h2>
				<p className="mx-auto mt-4 max-w-[56ch] text-gray-700 text-lg leading-8">
					Une demande particulière, un bug, une idée ? N’hésitez pas à nous contacter via le formulaire ci-dessous !
				</p>
			</div>
			<ContactForm action={sendMessage} {...(siteKey !== undefined && { siteKey })} />
			<section className="border-gray-200 border-t bg-white px-4 py-20 md:px-8 md:py-28">
				<div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-12 lg:gap-16">
					<div className="reveal lg:col-span-5">
						<Eyebrow>Contact</Eyebrow>
						<h2 className="mt-4 font-display font-medium text-3xl text-balance text-gray-900 tracking-tight sm:text-4xl">
							Contactez-nous
						</h2>
						<span aria-hidden="true" className="mt-6 block h-0.5 w-12 bg-indigo-900" />
						<p className="mt-6 max-w-[40ch] text-gray-700 text-lg leading-8">
							My-Makeup, plus qu’une plateforme de mise en relation, une équipe de passionnés à votre service !
						</p>
					</div>
					<ul className="grid list-none grid-cols-1 gap-6 p-0 sm:grid-cols-2 lg:col-span-7">
						{CONTACT_DETAILS.map(({ titre, email }) => (
							<li
								key={email}
								className="reveal flex flex-col gap-4 rounded-2xl border border-gray-200 bg-neutral-50 p-8"
							>
								<span className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-50 text-indigo-900">
									<EnvelopeIcon className="h-6 w-6" />
								</span>
								<h3 className="font-display font-medium text-gray-900 text-xl leading-snug tracking-tight">{titre}</h3>
								<dl className="text-sm leading-6">
									<div>
										<dt className="sr-only">Email</dt>
										<dd>
											<a
												className="break-all font-semibold text-indigo-800 underline decoration-indigo-300 underline-offset-4"
												href={`mailto:${email}`}
											>
												{email}
											</a>
										</dd>
									</div>
								</dl>
							</li>
						))}
					</ul>
				</div>
			</section>
			<Cta />
		</ContentPage>
	)
}

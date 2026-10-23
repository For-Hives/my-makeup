import type { Metadata } from 'next'
import { Cta } from '@/components/blocks/Cta'
import { Hero } from '@/components/blocks/Hero'
import { ContactForm } from '@/components/contact/ContactForm'
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

export default function PageContact() {
	return (
		<main className="relative">
			<Hero
				image="/assets/back/maquilleuse_europeenne_white.webp"
				titre="Contact"
				description="Une idée, une envie de collaborer, une question ? N’hésitez pas à nous contacter !"
				recherche={false}
			/>
			<div className="mx-auto mt-32 max-w-2xl px-4 text-center md:px-0">
				<h2 className="font-bold text-3xl text-gray-900 tracking-tight sm:text-4xl">Un message en particulier ?</h2>
				<p className="mt-2 text-gray-600 text-lg leading-8">
					Une demande particulière, un bug, une idée ? N’hésitez pas à nous contacter via le formulaire ci-dessous !
				</p>
			</div>
			<ContactForm action={sendMessage} />
			<section className="relative py-20">
				<div className="mx-auto flex max-w-7xl flex-col px-4 md:flex-row md:px-8 xl:px-0">
					<div className="mx-auto mb-10 w-full md:w-1/2">
						<h2 className="w-full text-start font-bold text-4xl text-gray-900 tracking-tight sm:text-4xl md:w-1/2">
							Contactez-nous
						</h2>
						<p className="mt-6 w-full text-start text-gray-700 text-lg md:w-1/2">
							My-Makeup, plus qu’une plateforme de mise en relation, une équipe de passionnés à votre service !
						</p>
					</div>
					<div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 md:w-1/2 lg:col-span-2 lg:gap-8">
						{CONTACT_DETAILS.map(({ titre, email }) => (
							<div key={email} className="rounded-2xl bg-gray-50 p-10">
								<h3 className="font-semibold text-base text-gray-900 leading-7">{titre}</h3>
								<dl className="mt-3 space-y-1 text-gray-600 text-sm leading-6">
									<div>
										<dt className="sr-only">Email</dt>
										<dd>
											<a className="font-semibold text-indigo-600" href={`mailto:${email}`}>
												{email}
											</a>
										</dd>
									</div>
								</dl>
							</div>
						))}
					</div>
				</div>
			</section>
			<Cta />
		</main>
	)
}

import ContactForm from '@/components/Contact/ContactForm'
import Footer from '@/components/Global/Footer'
import Hero from '@/components/Global/Hero'
import Nav from '@/components/Global/Nav'
import CTA from '@/components/Global/CTA'

export const metadata = {
	description:
		"Contactez-nous pour toute question, suggestion ou collaboration ! L'équipe My-Makeup est à votre écoute !",
	alternates: {
		canonical: 'https://my-makeup.fr/contact',
	},
	title: 'Contact - My-Makeup',
}

function Contact() {
	return (
		<>
			<Nav />
			<main className={'relative'}>
				<Hero
					description={
						<>
							{
								"Une idée, une envie de collaborer, une question ? N'hésitez pas à nous contacter !"
							}
						</>
					}
					imgBackgroundSrc={'/assets/back/maquilleuse_europeenne_white.webp'}
					isCTALoginDisplayed={false}
					isSearchDisplayed={false}
					isSimpleVersionDisplayed={true}
					title={<>Contact</>}
				/>
				<div className="mx-auto mt-32 max-w-2xl px-4 text-center md:px-0">
					<h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
						Un message en particulier ?
					</h2>
					<p className="mt-2 text-lg leading-8 text-gray-600">
						{
							"Une demande particulière, un bug, une idée ? N'hésitez pas à nous contacter via le formulaire ci-dessous !"
						}
					</p>
				</div>
				<ContactForm />
				<section className={'relative py-20'}>
					<div className="mx-auto flex max-w-7xl flex-col px-4 md:flex-row md:px-8 xl:px-0">
						<div className="mx-auto mb-10 w-full md:w-1/2">
							<h2 className="w-full text-start text-4xl font-bold tracking-tight text-gray-900 sm:text-4xl md:w-1/2">
								Contactez-nous
							</h2>
							<p className="mt-6 w-full text-start text-lg text-gray-700 md:w-1/2">
								{
									"My-Makeup, plus qu'une plateforme de mise en relation, une équipe de passionnés à votre service !"
								}
							</p>
						</div>
						<div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 md:w-1/2 lg:col-span-2 lg:gap-8">
							<div className="rounded-2xl bg-gray-50 p-10">
								<h3 className="text-base font-semibold leading-7 text-gray-900">
									Contact général
								</h3>
								<dl className="mt-3 space-y-1 text-sm leading-6 text-gray-600">
									<div>
										<dt className="sr-only">Email</dt>
										<dd>
											<a
												className="font-semibold text-indigo-600"
												href="mailto:contact@my-makeup.fr"
											>
												contact@my-makeup.fr
											</a>
										</dd>
									</div>
									<div className="mt-1">
										<dt className="sr-only">Phone number</dt>
										<dd>06 21 58 26 84</dd>
									</div>
								</dl>
							</div>
							<div className="rounded-2xl bg-gray-50 p-10">
								<h3 className="text-base font-semibold leading-7 text-gray-900">
									Travailler avec nous
								</h3>
								<dl className="mt-3 space-y-1 text-sm leading-6 text-gray-600">
									<div>
										<dt className="sr-only">Email</dt>
										<dd>
											<a
												className="font-semibold text-indigo-600"
												href="mailto:jobs@my-makeup.fr"
											>
												jobs@my-makeup.fr
											</a>
										</dd>
									</div>
								</dl>
							</div>
							<div className="rounded-2xl bg-gray-50 p-10">
								<h3 className="text-base font-semibold leading-7 text-gray-900">
									Relation entreprise
								</h3>
								<dl className="mt-3 space-y-1 text-sm leading-6 text-gray-600">
									<div>
										<dt className="sr-only">Email</dt>
										<dd>
											<a
												className="font-semibold text-indigo-600"
												href="mailto:pro@my-makeup.fr"
											>
												pro@my-makeup.fr
											</a>
										</dd>
									</div>
									<div className="mt-1">
										<dt className="sr-only">Numéro de téléphone</dt>
										<dd>06 21 58 26 84</dd>
									</div>
								</dl>
							</div>
							<div className="rounded-2xl bg-gray-50 p-10">
								<h3 className="text-base font-semibold leading-7 text-gray-900">
									Aide et questions
								</h3>
								<dl className="mt-3 space-y-1 text-sm leading-6 text-gray-600">
									<div>
										<dt className="sr-only">Email</dt>
										<dd>
											<a
												className="font-semibold text-indigo-600"
												href="mailto:help@my-makeup.fr"
											>
												help@my-makeup.fr
											</a>
										</dd>
									</div>
									<div className="mt-1">
										<dt className="sr-only">Phone number</dt>
										<dd>06 21 58 26 84</dd>
									</div>
								</dl>
							</div>
						</div>
					</div>
				</section>

				<CTA />
			</main>
			<Footer />
		</>
	)
}

export default Contact

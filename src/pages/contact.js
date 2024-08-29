import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import React from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import Head from 'next/head'
import Link from 'next/link'
import { z } from 'zod'

import Footer from '@/components/Global/Footer'
import Hero from '@/components/Global/Hero'
import Nav from '@/components/Global/Nav'
import CTA from '@/components/Global/CTA'

const schema = z
	.object({
		phone_number: z
			.string()
			.nonempty({ message: 'Le numéro de téléphone est requis' }),
		first_name: z.string().nonempty({ message: 'Le prénom est requis' }),
		message: z.string().nonempty({ message: 'Le message est requis' }),
		last_name: z.string().nonempty({ message: 'Le nom est requis' }),
		email: z.string().email({ message: "L'e-mail est invalide" }),
	})
	.required()

function Contact(props) {
	const {
		formState: { errors },
		handleSubmit,
		register,
		reset, // pour réinitialiser le formulaire
	} = useForm({
		resolver: zodResolver(schema),
	})

	// Créez une nouvelle fonction pour gérer la soumission du formulaire
	const onSubmit = async data => {
		const response = await fetch('/api/sendMail', {
			body: JSON.stringify({
				phone_number: data.phone_number,
				first_name: data.first_name,
				last_name: data.last_name,
				message: data.message,
				email: data.email,
			}),
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
		})

		if (response.ok) {
			reset()
			toast('Le message a bien été envoyé !', {
				toastId: 'toast-alert',
			})
		} else {
			toast("Une erreur s'est produite !", {
				toastId: 'toast-alert',
			})
		}
	}

	return (
		<>
			<Head>
				<title>Contact - My-Makeup</title>
				<meta
					content="Contactez-nous pour toute question, suggestion ou collaboration ! L'équipe My-Makeup est à votre écoute !"
					name="description"
				/>
				{/*	seo tag canonical link */}
				<link href={'https://my-makeup.fr/contact'} rel="canonical" />
			</Head>
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
				<form
					className="mx-auto my-32 max-w-xl px-4 sm:mt-20 md:px-0"
					onSubmit={handleSubmit(onSubmit)}
				>
					<div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
						<div>
							<label
								className="block text-sm font-semibold leading-6 text-gray-900"
								htmlFor="first_name"
							>
								Prénom
							</label>
							<div className="mt-2.5">
								<input
									id="first_name"
									name="first_name"
									type="text"
									{...register('first_name', {
										required: true,
									})}
									autoComplete="given-name"
									className="block w-full rounded-md border-0 px-3.5 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
								/>
								{errors.first_name && (
									<p className={'mt-2 text-xs text-red-500/80'}>
										{errors.first_name.message}
									</p>
								)}
							</div>
						</div>
						<div>
							<label
								className="block text-sm font-semibold leading-6 text-gray-900"
								htmlFor="last_name"
							>
								Nom
							</label>
							<div className="mt-2.5">
								<input
									id="last_name"
									name="last_name"
									type="text"
									{...register('last_name', {
										required: true,
									})}
									autoComplete="family-name"
									className="block w-full rounded-md border-0 px-3.5 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
								/>
							</div>
							{errors.last_name && (
								<p className={'mt-2 text-xs text-red-500/80'}>
									{errors.last_name.message}
								</p>
							)}
						</div>
						<div className="sm:col-span-2">
							<label
								className="block text-sm font-semibold leading-6 text-gray-900"
								htmlFor="email"
							>
								Email
							</label>
							<div className="mt-2.5">
								<input
									id="email"
									name="email"
									type="email"
									{...register('email', {
										required: true,
									})}
									autoComplete="email"
									className="block w-full rounded-md border-0 px-3.5 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
								/>
							</div>
							{errors.email && (
								<p className={'mt-2 text-xs text-red-500/80'}>
									{errors.email.message}
								</p>
							)}
						</div>
						<div className="sm:col-span-2">
							<label
								className="block text-sm font-semibold leading-6 text-gray-900"
								htmlFor="phone_number"
							>
								Numéro de téléphone
							</label>
							<div className="relative mt-2.5">
								<input
									id="phone_number"
									name="phone_number"
									type="tel"
									{...register('phone_number', {
										required: true,
									})}
									autoComplete="tel"
									className="block w-full rounded-md border-0 px-3.5 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
								/>
							</div>
							{errors.phone_number && (
								<p className={'mt-2 text-xs text-red-500/80'}>
									{errors.phone_number.message}
								</p>
							)}
						</div>
						<div className="sm:col-span-2">
							<label
								className="block text-sm font-semibold leading-6 text-gray-900"
								htmlFor="message"
							>
								Message
							</label>
							<div className="mt-2.5">
								<textarea
									id="message"
									name="message"
									rows={4}
									{...register('message', {
										required: true,
									})}
									className="block w-full rounded-md border-0 px-3.5 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
									defaultValue={''}
								/>
							</div>
							{errors.message && (
								<p className={'mt-2 text-xs text-red-500/80'}>
									{errors.message.message}
								</p>
							)}
						</div>
						<div className={'sm:col-span-2'}>
							<p className="text-sm leading-6 text-gray-600">
								En envoyant votre message, vous acceptez notre{' '}
								<Link
									className="font-semibold"
									href="/politique-de-confidentialite"
								>
									politique&nbsp;de&nbsp;confidentialité.
								</Link>
							</p>
						</div>
					</div>
					<div className="mt-10">
						<button
							className="block w-full rounded-md bg-indigo-900 px-3.5 py-2.5 text-center text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-900"
							type="submit"
						>
							{"Envoyer l'email"}
						</button>
					</div>
				</form>
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

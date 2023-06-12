import React, { useState } from 'react'
import Nav from '@/components/Global/Nav'
import Footer from '@/components/Global/Footer'
import ResponsiveTemporary from '@/components/Global/ResponsiveTemporary'
import Head from 'next/head'
import Image from 'next/image'
import Hero from '@/components/Global/Hero'
import { Switch } from '@headlessui/react'
import { z } from 'zod'

import CTA from '@/components/Global/CTA'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

function classNames(...classes) {
	return classes.filter(Boolean).join(' ')
}

const schema = z.object({
	first_name: z.string().nonempty({ message: 'Le prénom est requis' }),
	last_name: z.string().nonempty({ message: 'Le nom est requis' }),
	company: z.string().nonempty({ message: "L'entreprise est requise" }),
	email: z.string().email({ message: "L'e-mail est invalide" }),
	phone_number: z
		.string()
		.nonempty({ message: 'Le numéro de téléphone est requis' }),
	message: z.string().nonempty({ message: 'Le message est requis' }),
})

function Contact(props) {
	const [agreed, setAgreed] = useState(false)

	const {
		register,
		handleSubmit,
		formState: { errors },
		reset, // pour réinitialiser le formulaire
	} = useForm({
		resolver: zodResolver(schema),
	})

	// Créez une nouvelle fonction pour gérer la soumission du formulaire
	const onSubmit = async event => {
		event.preventDefault()

		const response = await fetch('/api/sendMail', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				firstName: event.target['first-name'].value,
				lastName: event.target['last_name'].value,
				company: event.target.company.value,
				email: event.target.email.value,
				phoneNumber: event.target['phone_number'].value,
				message: event.target.message.value,
			}),
		})

		if (response.ok) {
			// Le mail a été envoyé avec succès
			// Vous pouvez ici gérer le retour à donner à l'utilisateur
			reset()
		} else {
			// Une erreur s'est produite lors de l'envoi du mail
			// Vous pouvez ici gérer le retour à donner à l'utilisateur
		}
	}

	return (
		<>
			<Head>
				<title>Contact - My Makeup</title>
				<meta
					name="description"
					content="Contactez-nous pour toute question, suggestion ou collaboration ! L'équipe My Makeup est à votre écoute !"
				/>
			</Head>
			<div className={'relative'}>
				<Image
					src={'/assets/coming-soon.svg'}
					alt={'Coming soon'}
					width={'80'}
					height={'80'}
					className={
						'fixed left-0 top-0 z-50 m-4 rounded-full bg-amber-300/75 p-2'
					}
				/>
				<Nav />
				<main className={'relative'}>
					<ResponsiveTemporary />
					<Hero
						title={<>Contact</>}
						description={
							<>
								{
									"Une idée, une envie de collaborer, une question ? N'hésitez pas à nous contacter !"
								}
							</>
						}
					/>
					<div className="mx-auto mt-32 max-w-2xl text-center">
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
						onSubmit={handleSubmit(onSubmit)}
						className="mx-auto my-32 max-w-xl sm:mt-20"
					>
						<div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
							<div>
								<label
									htmlFor="first_name"
									className="block text-sm font-semibold leading-6 text-gray-900"
								>
									Prénom
								</label>
								<div className="mt-2.5">
									<input
										type="text"
										name="first_name"
										id="first_name"
										{...register('first_name')}
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
									htmlFor="last_name"
									className="block text-sm font-semibold leading-6 text-gray-900"
								>
									Nom
								</label>
								<div className="mt-2.5">
									<input
										type="text"
										name="last_name"
										id="last_name"
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
									htmlFor="company"
									className="block text-sm font-semibold leading-6 text-gray-900"
								>
									Entreprise
								</label>
								<div className="mt-2.5">
									<input
										type="text"
										name="company"
										id="company"
										autoComplete="organization"
										className="block w-full rounded-md border-0 px-3.5 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
									/>
								</div>
								{errors.company && (
									<p className={'mt-2 text-xs text-red-500/80'}>
										{errors.company.message}
									</p>
								)}
							</div>
							<div className="sm:col-span-2">
								<label
									htmlFor="email"
									className="block text-sm font-semibold leading-6 text-gray-900"
								>
									Email
								</label>
								<div className="mt-2.5">
									<input
										type="email"
										name="email"
										id="email"
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
									htmlFor="phone_number"
									className="block text-sm font-semibold leading-6 text-gray-900"
								>
									Numéro de téléphone
								</label>
								<div className="relative mt-2.5">
									<input
										type="tel"
										name="phone_number"
										id="phone_number"
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
									htmlFor="message"
									className="block text-sm font-semibold leading-6 text-gray-900"
								>
									Message
								</label>
								<div className="mt-2.5">
									<textarea
										name="message"
										id="message"
										rows={4}
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
							<Switch.Group as="div" className="flex gap-x-4 sm:col-span-2">
								<div className="flex h-6 w-6 items-center">
									<Switch
										checked={agreed}
										onChange={setAgreed}
										className={classNames(
											agreed ? 'bg-indigo-900' : 'bg-gray-200',
											'flex w-8 flex-none cursor-pointer rounded-full p-px ring-1 ring-inset ring-gray-900/5 transition-colors duration-200 ease-in-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-900'
										)}
									>
										<span className="sr-only">
											{"Accepter les conditions générales d'utilisation"}
										</span>
										<span
											aria-hidden="true"
											className={classNames(
												agreed ? 'translate-x-3.5' : 'translate-x-0',
												'h-4 w-4 transform rounded-full bg-white shadow-sm ring-1 ring-gray-900/5 transition duration-200 ease-in-out'
											)}
										/>
									</Switch>
								</div>
								<Switch.Label className="text-sm leading-6 text-gray-600">
									En sélectionnant cette option, vous acceptez notre{' '}
									<a href="#" className="text-900-600 font-semibold">
										politique&nbsp;de&nbsp;confidentialité.
									</a>
								</Switch.Label>
							</Switch.Group>
						</div>
						<div className="mt-10">
							<button
								type="submit"
								className="block w-full rounded-md bg-indigo-900 px-3.5 py-2.5 text-center text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-900"
							>
								{"Envoyer l'email"}
							</button>
						</div>
					</form>
					<section className={'relative py-20'}>
						<div className="mx-auto flex max-w-7xl">
							<div className="mx-auto mb-10 w-1/2">
								<h2 className="w-1/2 text-start text-4xl font-bold tracking-tight text-slate-900 sm:text-4xl">
									Contactez-nous
								</h2>
								<p className="mt-6 w-1/2 text-start text-lg text-slate-700">
									{
										"My Makeup, plus qu'une plateforme de mise en relation, une équipe de passionnés à votre service !"
									}
								</p>
							</div>
							<div className="grid w-1/2 grid-cols-1 gap-6 sm:grid-cols-2 lg:col-span-2 lg:gap-8">
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
			</div>
		</>
	)
}

export default Contact

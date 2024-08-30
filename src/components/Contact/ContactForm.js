'use client'

import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { z } from 'zod'

const schema = z
	.object({
		phone_number: z
			.string()
			.min(1, { message: 'Le numéro de téléphone est requis' }),
		first_name: z.string().min(1, { message: 'Le prénom est requis' }),
		message: z.string().min(1, { message: 'Le message est requis' }),
		last_name: z.string().min(1, { message: 'Le nom est requis' }),
		email: z.string().email({ message: "L'e-mail est invalide" }),
	})
	.required()

const ContactForm = () => {
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
	)
}

export default ContactForm

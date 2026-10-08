import React, { useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import Image from 'next/image'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as zod from 'zod'
import {
	issueDemandeReinitialisation,
	MESSAGES_MOT_DE_PASSE,
	motDePasseOublieActif,
} from '@/lib/mot-de-passe'

// Off until Strapi really sends emails (Mailgun): build-time variable
const ACTIF = motDePasseOublieActif(process.env.NEXT_PUBLIC_FORGOT_PASSWORD)

const schema = zod
	.object({
		email: zod
			.string({ required_error: 'Email est requis' })
			.trim()
			.email('Email invalide'),
	})
	.required({ email: true })

/**
 * Forgotten password, first step (A7): asks Strapi to email a link to
 * /auth/reinitialiser. The answer reads the same whether the address has an
 * account or not (src/lib/mot-de-passe.js).
 */
function MotDePasseOublie() {
	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm({
		resolver: zodResolver(schema),
	})
	const [envoi, setEnvoi] = useState(false)
	const [issue, setIssue] = useState(null)

	const onSubmit = async ({ email }) => {
		setEnvoi(true)
		setIssue(null)
		let status = 0
		try {
			const reponse = await fetch(
				`${process.env.NEXT_PUBLIC_API_URL}/api/auth/forgot-password`,
				{
					method: 'POST',
					headers: {
						Accept: 'application/json',
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ email }),
					signal: AbortSignal.timeout(15_000),
				}
			)
			status = reponse.status
		} catch {
			status = 0 // network error or timeout
		}
		setIssue(issueDemandeReinitialisation(status))
		setEnvoi(false)
	}

	return (
		<>
			<Head>
				<title>Mot de passe oublié - My-Makeup</title>
				<meta name="robots" content="noindex" />
			</Head>
			<main className="flex min-h-screen items-center justify-center bg-white px-4 py-12">
				<div className="w-full max-w-sm">
					<Link href={'/'}>
						<span className="sr-only">My-Makeup</span>
						<Image
							alt="Logo My-Makeup"
							width={50}
							height={50}
							src="/assets/logo.webp"
						/>
					</Link>
					<h1 className="mt-6 text-3xl font-bold tracking-tight text-gray-900">
						Mot de passe oublié
					</h1>

					{!ACTIF ? (
						<p
							data-cy="forgot-unavailable"
							className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900"
						>
							La réinitialisation du mot de passe par email arrive bientôt. En
							attendant, écris-nous depuis la{' '}
							<Link href={'/contact'} className="font-semibold underline">
								page contact
							</Link>{' '}
							: nous t&apos;aiderons à retrouver l&apos;accès à ton compte.
						</p>
					) : issue === 'envoyee' ? (
						<p
							role="status"
							data-cy="forgot-result"
							className="mt-4 rounded-md bg-indigo-50 p-3 text-sm text-indigo-900"
						>
							{MESSAGES_MOT_DE_PASSE.envoyee}
						</p>
					) : (
						<>
							<p className="mt-4 text-sm text-gray-700">
								Indique l&apos;adresse email de ton compte : tu recevras un lien
								pour choisir un nouveau mot de passe.
							</p>
							<form
								onSubmit={handleSubmit(onSubmit)}
								method="POST"
								className="mt-6 space-y-6"
								noValidate
							>
								<div>
									<label
										htmlFor="email"
										className="block text-sm font-medium leading-6 text-gray-900"
									>
										Adresse email
									</label>
									<div className="mt-2">
										<input
											data-cy="forgot-email-input"
											id="email"
											type="email"
											inputMode="email"
											autoComplete="email"
											{...register('email')}
											required
											aria-invalid={!!errors.email}
											aria-describedby={
												errors.email ? 'email-erreur' : undefined
											}
											className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
										/>
										{errors.email && (
											<p
												id="email-erreur"
												className={'mt-2 text-xs text-red-500/80'}
											>
												{errors.email.message}
											</p>
										)}
									</div>
								</div>
								{issue && (
									<p
										role="alert"
										data-cy="forgot-error"
										className="rounded-md bg-red-50 p-3 text-sm text-red-800"
									>
										{MESSAGES_MOT_DE_PASSE[issue]}
									</p>
								)}
								<button
									data-cy="forgot-submit"
									type="submit"
									disabled={envoi}
									aria-busy={envoi}
									className="btn-primary-large min-h-[44px] disabled:cursor-wait disabled:opacity-60"
								>
									{envoi ? 'Envoi…' : 'Recevoir un lien'}
								</button>
							</form>
						</>
					)}

					<Link
						href={'/auth/signin'}
						className="mt-8 inline-flex min-h-[44px] items-center text-sm font-semibold text-indigo-700 hover:underline"
					>
						Revenir à la connexion
					</Link>
				</div>
			</main>
		</>
	)
}

export default MotDePasseOublie

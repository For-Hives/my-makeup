import React, { useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import Image from 'next/image'
import {
	codeEchecReinitialisation,
	codeReinitialisation,
	COOKIE_CODE,
	cookieCode,
	erreurNouveauMotDePasse,
	MESSAGES_MOT_DE_PASSE,
	MOT_DE_PASSE_MIN,
} from '@/lib/mot-de-passe'
import { signalAvecDelai } from '@/lib/delai'

/**
 * Forgotten password, second step (A7): the link of the email
 * (/auth/reinitialiser?code=…) sets a new password with
 * POST /api/auth/reset-password. The code is moved from the URL to a
 * cookie of this page on the server first (getServerSideProps), so it never
 * reaches the audience measurement, the history or a Referer.
 */
function Reinitialiser({ code }) {
	const [motDePasse, setMotDePasse] = useState('')
	const [confirmation, setConfirmation] = useState('')
	const [envoi, setEnvoi] = useState(false)
	const [erreur, setErreur] = useState(code ? null : 'code-absent')
	const [modifie, setModifie] = useState(false)

	const onSubmit = async event => {
		event.preventDefault()
		const probleme = erreurNouveauMotDePasse(motDePasse, confirmation)
		if (probleme) {
			setErreur(probleme)
			return
		}
		setEnvoi(true)
		setErreur(null)
		let status = 0
		let message = ''
		try {
			const reponse = await fetch(
				`${process.env.NEXT_PUBLIC_API_URL}/api/auth/reset-password`,
				{
					method: 'POST',
					headers: {
						Accept: 'application/json',
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						code,
						password: motDePasse,
						passwordConfirmation: confirmation,
					}),
					signal: signalAvecDelai(15_000),
				}
			)
			status = reponse.status
			if (!reponse.ok) {
				const corps = await reponse.json().catch(() => null)
				message = corps?.error?.message ?? ''
			}
		} catch {
			status = 0
		}
		setEnvoi(false)
		if (status >= 200 && status < 300) {
			setModifie(true)
			setMotDePasse('')
			setConfirmation('')
			return
		}
		setErreur(codeEchecReinitialisation(status, message))
	}

	const lienPerime = erreur === 'code-invalide' || erreur === 'code-absent'

	return (
		<>
			<Head>
				<title>Nouveau mot de passe - My-Makeup</title>
				<meta name="referrer" content="no-referrer" />
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
						Nouveau mot de passe
					</h1>

					{modifie ? (
						<>
							<p
								role="status"
								data-cy="reset-result"
								className="mt-4 rounded-md bg-indigo-50 p-3 text-sm text-indigo-900"
							>
								{MESSAGES_MOT_DE_PASSE.modifie}
							</p>
							<Link
								href={'/auth/signin'}
								data-cy="reset-signin"
								className="btn-primary-large mt-8 min-h-[44px]"
							>
								Me connecter
							</Link>
						</>
					) : (
						<form
							onSubmit={onSubmit}
							method="POST"
							className="mt-6 space-y-6"
							noValidate
						>
							<div>
								<label
									htmlFor="password"
									className="block text-sm font-medium leading-6 text-gray-900"
								>
									Nouveau mot de passe
								</label>
								<p id="password-aide" className="text-xs text-gray-600">
									{MOT_DE_PASSE_MIN} caractères au moins.
								</p>
								<div className="mt-2">
									<input
										data-cy="reset-password-input"
										id="password"
										name="password"
										type="password"
										autoComplete="new-password"
										required
										minLength={MOT_DE_PASSE_MIN}
										aria-describedby="password-aide"
										value={motDePasse}
										onChange={e => setMotDePasse(e.target.value)}
										disabled={!code}
										className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
									/>
								</div>
							</div>
							<div>
								<label
									htmlFor="password-confirmation"
									className="block text-sm font-medium leading-6 text-gray-900"
								>
									Confirme le mot de passe
								</label>
								<div className="mt-2">
									<input
										data-cy="reset-confirmation-input"
										id="password-confirmation"
										name="password-confirmation"
										type="password"
										autoComplete="new-password"
										required
										value={confirmation}
										onChange={e => setConfirmation(e.target.value)}
										disabled={!code}
										className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
									/>
								</div>
							</div>
							{erreur && (
								<p
									role="alert"
									data-cy="reset-error"
									className="rounded-md bg-red-50 p-3 text-sm text-red-800"
								>
									{MESSAGES_MOT_DE_PASSE[erreur]}
								</p>
							)}
							{lienPerime ? (
								<Link
									href={'/auth/mot-de-passe-oublie'}
									data-cy="reset-new-link"
									className="btn-primary-large min-h-[44px]"
								>
									Demander un nouveau lien
								</Link>
							) : (
								<button
									data-cy="reset-submit"
									type="submit"
									disabled={envoi}
									aria-busy={envoi}
									className="btn-primary-large min-h-[44px] disabled:cursor-wait disabled:opacity-60"
								>
									{envoi ? 'Enregistrement…' : 'Enregistrer'}
								</button>
							)}
						</form>
					)}
				</div>
			</main>
		</>
	)
}

export const getServerSideProps = async ({ query, req, res }) => {
	res.setHeader('Cache-Control', 'private, no-store')
	res.setHeader('Referrer-Policy', 'no-referrer')

	// link of the email: keep the code in a cookie of this page, reload
	// without it (the URL is what the audience measurement records)
	if (query.code !== undefined) {
		const code = codeReinitialisation(query.code)
		if (code) {
			res.setHeader(
				'Set-Cookie',
				cookieCode(code, {
					secure: String(process.env.NEXTAUTH_URL ?? '').startsWith('https://'),
				})
			)
		}
		return {
			redirect: { destination: '/auth/reinitialiser', permanent: false },
		}
	}

	return {
		props: { code: codeReinitialisation(req.cookies?.[COOKIE_CODE]) },
	}
}

export default Reinitialiser

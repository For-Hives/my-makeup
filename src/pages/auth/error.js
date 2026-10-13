import Head from 'next/head'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect } from 'react'
import { track } from '@/lib/analytics'
import { messageErreur, normaliserCodeErreur } from '@/lib/auth-erreurs'

// `auth_error` already sent by this document: once per page load, as on the
// sign-in page (erreurComptee in signin.js). « Revenir à la connexion » then
// the Back button show this page again without loading it. Only written in
// an effect: never on the server, where the module is shared.
let comptee = false

/**
 * NextAuth error page (?error=<code>): Google refused by Strapi, NextAuth
 * configuration… The code is read on the server and reduced to the closed
 * list, so the page never shows what was typed in the URL.
 */
function AuthErrorPage({ code }) {
	useEffect(() => {
		if (comptee) return
		comptee = true
		track('auth_error', { code })
	}, [code])

	return (
		<>
			<Head>
				<title>Connexion impossible - My-Makeup</title>
			</Head>
			<main className="flex min-h-screen items-center justify-center bg-white px-4">
				<div className="w-full max-w-sm">
					<Link href={'/'}>
						<span className="sr-only">My-Makeup</span>
						<Image alt="Logo My-Makeup" width={50} height={50} src="/assets/logo.webp" />
					</Link>
					<h1 className="mt-6 text-3xl font-bold tracking-tight text-gray-900">Connexion impossible</h1>
					<p role="alert" data-cy="auth-error-message" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
						{messageErreur(code)}
					</p>
					<Link href={'/auth/signin'} className="btn-primary-large mt-8">
						Revenir à la connexion
					</Link>
				</div>
			</main>
		</>
	)
}

export const getServerSideProps = ({ query, res }) => {
	res.setHeader('Cache-Control', 'private, no-store')
	const code = normaliserCodeErreur(query.error) ?? 'erreur-inconnue'
	// a NextAuth name or a raw message becomes its code, in the URL too
	if (query.error !== code) {
		return {
			redirect: {
				destination: `/auth/error?error=${code}`,
				permanent: false,
			},
		}
	}
	return { props: { code } }
}

export default AuthErrorPage

import React, { useEffect, useRef } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import Image from 'next/image'
import { messageErreur, normaliserCodeErreur } from '@/lib/auth-erreurs'
import { track } from '@/lib/analytics'

/**
 * NextAuth error page (?error=<code>): Google refused by Strapi, NextAuth
 * configuration… The code is read on the server and reduced to the closed
 * list, so the page never shows what was typed in the URL.
 */
function Error({ code }) {
	const comptee = useRef(false)
	useEffect(() => {
		if (comptee.current) return
		comptee.current = true
		track('auth_error', { code })
	}, [code])

	return (
		<>
			<Head>
				<title>Connexion impossible - My-Makeup</title>
				<meta name="robots" content="noindex" />
			</Head>
			<main className="flex min-h-screen items-center justify-center bg-white px-4">
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
						Connexion impossible
					</h1>
					<p
						role="alert"
						data-cy="auth-error-message"
						className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800"
					>
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

export const getServerSideProps = async ({ query, res }) => {
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

export default Error

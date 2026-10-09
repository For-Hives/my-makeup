import Head from 'next/head'
import React from 'react'
import Link from 'next/link'
import Nav from '@/components/Global/Nav'
import Footer from '@/components/Global/Footer'
import ResumeProfil from '@/components/Profil/Parents/ResumeProfil'
import { useSession } from 'next-auth/react'
import { getServerSession } from 'next-auth/next'
import InfosProfil from '@/components/Profil/Parents/InfosProfil'
import DangerZone from '@/components/Global/DangerZone'
import {
	API_SERVEUR,
	authOptions,
	journalAuth,
} from '@/pages/api/auth/[...nextauth]'
import { messageErreur } from '@/lib/auth-erreurs'
import {
	aCookieDeSession,
	cookiesSessionAEffacer,
	DELAI_STRAPI_MS,
	urlSessionExpiree,
} from '@/lib/auth-session'
import { filtrerProfilPrive } from '@/lib/profil-prive'
import { useRouter } from 'next/router'

function Profil({ data, erreur }) {
	// the modals read the Strapi JWT from here (loaded after the page)
	const { data: session } = useSession()
	const router = useRouter()

	const [user, setUser] = React.useState(data)
	// the URL holds the view, for every card at once: a reload or a direct
	// load of ?publicView=true shows the public view only (UI-02)
	const isPublic = router.query.publicView === 'true'

	// « Voir mon profil public » and « Modifier mon profil »: the same page,
	// without reading the profile again
	const handleIsPublic = visible => {
		router.push(
			{
				pathname: '/auth/profil',
				query: visible ? { publicView: 'true' } : {},
			},
			undefined,
			{ shallow: true }
		)
	}

	const handleUpdateUser = newUser => {
		setUser(newUser)
	}

	return (
		<>
			<Head>
				<title>My-Makeup</title>
				<meta
					name="description"
					content="Page de profil sur my-makeup.fr la plateforme qui va révolutionner votre façon de travailler !"
				/>
			</Head>
			<Nav isProfileBtnVisible={false} />
			<main className={'relative'}>
				{user ? (
					<>
						<ResumeProfil
							user={user}
							handleUpdateUser={handleUpdateUser}
							isPublic={isPublic}
						/>
						<InfosProfil
							user={user}
							handleUpdateUser={handleUpdateUser}
							isPublic={isPublic}
							handleIsPublic={handleIsPublic}
						/>
						<DangerZone session={session} />
					</>
				) : (
					<div className="flex h-screen flex-col items-center justify-center gap-6 px-4">
						<h1 className="text-center text-2xl font-bold text-gray-700">
							{messageErreur(erreur)}
						</h1>
						<Link href={'/auth/profil'} className="btn-primary-large w-auto">
							Réessayer
						</Link>
					</div>
				)}
			</main>
			<Footer />
		</>
	)
}

export const getServerSideProps = async ({ req, res, resolvedUrl }) => {
	// private page: never in a shared cache (it used to be public, s-maxage=10)
	res.setHeader('Cache-Control', 'private, no-store')

	// read in process, the refreshed session cookie goes back with the page
	const session = await getServerSession(req, res, authOptions)
	if (!session?.jwt) {
		const cookies = Object.keys(req.cookies ?? {})
		if (aCookieDeSession(cookies)) {
			// the session read refused the cookie (Strapi JWT expired, or
			// /users/me in 401): one redirection, with the message (RG-08),
			// back to the same page and query as the middleware's
			res.setHeader('Set-Cookie', cookiesSessionAEffacer(cookies))
			return {
				redirect: {
					destination: urlSessionExpiree(
						resolvedUrl ?? '/auth/profil',
						'jwt_expire'
					),
					permanent: false,
				},
			}
		}
		return {
			redirect: {
				destination: '/auth/signin?callbackUrl=%2Fauth%2Fprofil',
				permanent: false,
			},
		}
	}

	let response
	try {
		response = await fetch(`${API_SERVEUR}/api/me-makeup`, {
			headers: {
				Accept: 'application/json',
				Authorization: `Bearer ${session.jwt}`,
			},
			signal: AbortSignal.timeout(DELAI_STRAPI_MS),
		})
	} catch {
		return { props: { data: null, erreur: 'service-indisponible' } }
	}

	if (response.status === 401) {
		// Strapi refuses the JWT: delete the session (and its chunks) instead
		// of sending her to the sign-in page with a dead cookie (AUTH-01)
		journalAuth('session_expiree', { code: 'api_401' })
		res.setHeader(
			'Set-Cookie',
			cookiesSessionAEffacer(Object.keys(req.cookies ?? {}))
		)
		return {
			redirect: {
				destination: '/auth/signin?error=session-expiree',
				permanent: false,
			},
		}
	}

	// 400: no profile yet for this account, the onboarding creates it
	if (response.status === 400 || response.status === 404) {
		return { redirect: { destination: '/auth/init-account', permanent: false } }
	}

	if (!response.ok) {
		return { props: { data: null, erreur: 'service-indisponible' } }
	}

	// allow list: never the password hash, tokens or admin relations, and
	// no session (nor JWT) in __NEXT_DATA__
	const data = filtrerProfilPrive(await response.json().catch(() => null))
	return data
		? { props: { data } }
		: { props: { data: null, erreur: 'service-indisponible' } }
}

export default Profil

'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { signOut } from '@/app/(front)/(dashboard)/auth/actions'
import { TrackedLink } from '@/components/analytics/TrackedLink'
import { DASHBOARD_LINK, NAVIGATION, SEARCH_LINK, SIGN_IN_LINK } from './links'

const LINK = 'font-semibold text-gray-900 text-sm leading-6'
const RING = 'focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2'

function Chevron() {
	return (
		<svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
			<path
				fillRule="evenodd"
				d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
				clipRule="evenodd"
			/>
		</svg>
	)
}

/**
 * Whether a makeup artist is signed in, asked of the server by the browser once the page has
 * loaded (ticket 078). The session cookie is HttpOnly and the page is static and shared: it can
 * neither read the cookie nor depend on it. Until the answer comes, and whenever it cannot come,
 * the visitor is taken for signed out, which is what a shared page says.
 */
function useSignedIn(chemin: string): boolean {
	const [signedIn, setSignedIn] = useState(false)
	// A new page asks again: the visitor may have signed in or out since the last one.
	useEffect(() => {
		const stop = new AbortController()
		fetch('/api/dashboard/session', { cache: 'no-store', credentials: 'same-origin', signal: stop.signal })
			.then(reponse => (reponse.ok ? reponse.json() : { signedIn: false }))
			.then((corps: { signedIn?: unknown }) => setSignedIn(corps.signedIn === true))
			.catch(() => {
				if (!stop.signal.aborted) setSignedIn(false)
			})
		return () => stop.abort()
	}, [chemin])
	return signedIn
}

/**
 * The navigation of every public page. One markup for both widths: under 1024 px a button opens
 * the menu and the groups unfold in place; from 1024 px the menu is a row and the groups are
 * popovers. It reads no cookie and no session on the server: the page stays static, and the
 * signed-in state is read in the browser (`useSignedIn`).
 */
export function Nav() {
	const [menuOpen, setMenuOpen] = useState(false)
	const [group, setGroup] = useState<string | null>(null)
	const root = useRef<HTMLElement>(null)
	const menuButton = useRef<HTMLButtonElement>(null)
	const path = usePathname()
	const signedIn = useSignedIn(path)

	useEffect(() => {
		setMenuOpen(false)
		setGroup(null)
	}, [path])

	useEffect(() => {
		if (!menuOpen && group === null) return
		const onKeyDown = (evenement: KeyboardEvent) => {
			if (evenement.key !== 'Escape') return
			if (group !== null) {
				root.current?.querySelector<HTMLElement>(`[data-groupe="${group}"]`)?.focus()
				setGroup(null)
			} else {
				menuButton.current?.focus()
				setMenuOpen(false)
			}
		}
		const onClick = (evenement: PointerEvent) => {
			if (root.current && !root.current.contains(evenement.target as Node)) setGroup(null)
		}
		document.addEventListener('keydown', onKeyDown)
		document.addEventListener('pointerdown', onClick)
		return () => {
			document.removeEventListener('keydown', onKeyDown)
			document.removeEventListener('pointerdown', onClick)
		}
	}, [menuOpen, group])

	return (
		<header className="sticky top-0 z-30 border-gray-300 border-b bg-white">
			<nav
				ref={root}
				aria-label="Navigation principale"
				className="relative mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-x-10 px-6 py-3 lg:flex-nowrap lg:px-16"
			>
				<Link href="/" className={`-m-1.5 p-1.5 ${RING}`}>
					<span className="sr-only">My-Makeup</span>
					<Image alt="Logo My-Makeup" width={50} height={50} src="/assets/logo.webp" priority />
				</Link>
				<button
					ref={menuButton}
					type="button"
					aria-expanded={menuOpen}
					aria-controls="menu-principal"
					onClick={() => setMenuOpen(!menuOpen)}
					className={`flex h-11 w-11 items-center justify-center rounded-lg lg:hidden ${RING}`}
				>
					<span className="sr-only">Menu</span>
					<svg
						aria-hidden="true"
						className="h-6 w-6"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
					>
						{menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 17h16" />}
					</svg>
				</button>
				<div
					id="menu-principal"
					className={`${menuOpen ? 'flex' : 'hidden'} absolute inset-x-0 top-full max-h-[calc(100dvh-4.5rem)] flex-col gap-8 overflow-y-auto border-gray-300 border-b bg-white px-6 py-6 lg:static lg:flex lg:max-h-none lg:flex-1 lg:flex-row lg:items-center lg:justify-between lg:gap-10 lg:overflow-visible lg:border-0 lg:p-0`}
				>
					<ul className="flex flex-col gap-8 lg:flex-row lg:items-center lg:gap-10">
						{NAVIGATION.map(entree => (
							<li key={entree.nom} className="lg:relative">
								{'href' in entree ? (
									<Link href={entree.href} className={`${LINK} ${RING}`}>
										{entree.nom}
									</Link>
								) : (
									<>
										<button
											type="button"
											data-groupe={entree.nom}
											aria-expanded={group === entree.nom}
											aria-controls={`groupe-${entree.nom}`}
											onClick={() => setGroup(group === entree.nom ? null : entree.nom)}
											className={`inline-flex items-center gap-x-1 ${LINK} ${RING}`}
										>
											{entree.nom}
											<Chevron />
										</button>
										<ul
											id={`groupe-${entree.nom}`}
											className={`${group === entree.nom ? 'flex' : 'hidden'} mt-4 flex-col gap-4 lg:absolute lg:top-full lg:left-0 lg:mt-3 lg:w-96 lg:rounded-3xl lg:bg-white lg:p-4 lg:shadow-lg lg:ring-1 lg:ring-gray-900/5`}
										>
											{entree.enfants.map(enfant => (
												<li key={enfant.href} className="relative rounded-lg lg:p-4 lg:hover:bg-gray-50">
													<Link href={enfant.href} className={`font-semibold text-gray-900 text-sm ${RING}`}>
														{enfant.nom}
														<span className="absolute inset-0" />
													</Link>
													<p className="mt-1 text-gray-600 text-sm">{enfant.description}</p>
												</li>
											))}
										</ul>
									</>
								)}
							</li>
						))}
					</ul>
					<div className="flex flex-col items-start gap-8 lg:flex-row lg:items-center lg:gap-10">
						<TrackedLink
							href={SEARCH_LINK.href}
							suivi={{ nom: 'nav_recherche' }}
							className={`btn-primary-with-icon ${RING}`}
						>
							<svg aria-hidden="true" className="mr-2 h-5 w-5 text-indigo-900" viewBox="0 0 20 20" fill="currentColor">
								<path
									fillRule="evenodd"
									d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.45 4.39l3.58 3.58a.75.75 0 1 1-1.06 1.06l-3.58-3.58A7 7 0 0 1 2 9Z"
									clipRule="evenodd"
								/>
							</svg>
							{SEARCH_LINK.nom}
						</TrackedLink>
						{signedIn ? (
							<>
								<Link href={DASHBOARD_LINK.href} className={`${LINK} ${RING}`}>
									{DASHBOARD_LINK.nom}
								</Link>
								<form action={signOut}>
									<button type="submit" className={`btn-primary-simple ${RING}`}>
										Me déconnecter
									</button>
								</form>
							</>
						) : (
							<Link href={SIGN_IN_LINK.href} className={`btn-primary-simple ${RING}`}>
								{SIGN_IN_LINK.nom}
							</Link>
						)}
					</div>
				</div>
			</nav>
		</header>
	)
}

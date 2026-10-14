'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { LIEN_CONNEXION, LIEN_RECHERCHE, NAVIGATION } from './liens'

const LIEN = 'font-semibold text-gray-900 text-sm leading-6'
const ANNEAU = 'focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2'

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
 * The navigation of every public page. One markup for both widths: under 1024 px a button opens
 * the menu and the groups unfold in place; from 1024 px the menu is a row and the groups are
 * popovers. It reads no cookie and no session: the page stays static.
 */
export function Nav() {
	const [menuOuvert, setMenuOuvert] = useState(false)
	const [groupe, setGroupe] = useState<string | null>(null)
	const racine = useRef<HTMLElement>(null)
	const boutonMenu = useRef<HTMLButtonElement>(null)
	const chemin = usePathname()

	useEffect(() => {
		setMenuOuvert(false)
		setGroupe(null)
	}, [chemin])

	useEffect(() => {
		if (!menuOuvert && groupe === null) return
		const auClavier = (evenement: KeyboardEvent) => {
			if (evenement.key !== 'Escape') return
			if (groupe !== null) {
				racine.current?.querySelector<HTMLElement>(`[data-groupe="${groupe}"]`)?.focus()
				setGroupe(null)
			} else {
				boutonMenu.current?.focus()
				setMenuOuvert(false)
			}
		}
		const auClic = (evenement: PointerEvent) => {
			if (racine.current && !racine.current.contains(evenement.target as Node)) setGroupe(null)
		}
		document.addEventListener('keydown', auClavier)
		document.addEventListener('pointerdown', auClic)
		return () => {
			document.removeEventListener('keydown', auClavier)
			document.removeEventListener('pointerdown', auClic)
		}
	}, [menuOuvert, groupe])

	return (
		<header className="sticky top-0 z-30 border-gray-300 border-b bg-white">
			<nav
				ref={racine}
				aria-label="Navigation principale"
				className="relative mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-x-10 px-6 py-3 lg:flex-nowrap lg:px-16"
			>
				<Link href="/" className={`-m-1.5 p-1.5 ${ANNEAU}`}>
					<span className="sr-only">My-Makeup</span>
					<Image alt="Logo My-Makeup" width={50} height={50} src="/assets/logo.webp" priority />
				</Link>
				<button
					ref={boutonMenu}
					type="button"
					aria-expanded={menuOuvert}
					aria-controls="menu-principal"
					onClick={() => setMenuOuvert(!menuOuvert)}
					className={`flex h-11 w-11 items-center justify-center rounded-lg lg:hidden ${ANNEAU}`}
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
						{menuOuvert ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 17h16" />}
					</svg>
				</button>
				<div
					id="menu-principal"
					className={`${menuOuvert ? 'flex' : 'hidden'} absolute inset-x-0 top-full max-h-[calc(100dvh-4.5rem)] flex-col gap-8 overflow-y-auto border-gray-300 border-b bg-white px-6 py-6 lg:static lg:flex lg:max-h-none lg:flex-1 lg:flex-row lg:items-center lg:justify-between lg:gap-10 lg:overflow-visible lg:border-0 lg:p-0`}
				>
					<ul className="flex flex-col gap-8 lg:flex-row lg:items-center lg:gap-10">
						{NAVIGATION.map(entree => (
							<li key={entree.nom} className="lg:relative">
								{'href' in entree ? (
									<Link href={entree.href} className={`${LIEN} ${ANNEAU}`}>
										{entree.nom}
									</Link>
								) : (
									<>
										<button
											type="button"
											data-groupe={entree.nom}
											aria-expanded={groupe === entree.nom}
											aria-controls={`groupe-${entree.nom}`}
											onClick={() => setGroupe(groupe === entree.nom ? null : entree.nom)}
											className={`inline-flex items-center gap-x-1 ${LIEN} ${ANNEAU}`}
										>
											{entree.nom}
											<Chevron />
										</button>
										<ul
											id={`groupe-${entree.nom}`}
											className={`${groupe === entree.nom ? 'flex' : 'hidden'} mt-4 flex-col gap-4 lg:absolute lg:top-full lg:left-0 lg:mt-3 lg:w-96 lg:rounded-3xl lg:bg-white lg:p-4 lg:shadow-lg lg:ring-1 lg:ring-gray-900/5`}
										>
											{entree.enfants.map(enfant => (
												<li key={enfant.href} className="relative rounded-lg lg:p-4 lg:hover:bg-gray-50">
													<Link href={enfant.href} className={`font-semibold text-gray-900 text-sm ${ANNEAU}`}>
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
						<Link href={LIEN_RECHERCHE.href} className={`btn-primary-with-icon ${ANNEAU}`}>
							<svg aria-hidden="true" className="mr-2 h-5 w-5 text-indigo-900" viewBox="0 0 20 20" fill="currentColor">
								<path
									fillRule="evenodd"
									d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.45 4.39l3.58 3.58a.75.75 0 1 1-1.06 1.06l-3.58-3.58A7 7 0 0 1 2 9Z"
									clipRule="evenodd"
								/>
							</svg>
							{LIEN_RECHERCHE.nom}
						</Link>
						<Link href={LIEN_CONNEXION.href} className={`btn-primary-simple ${ANNEAU}`}>
							{LIEN_CONNEXION.nom}
						</Link>
					</div>
				</div>
			</nav>
		</header>
	)
}

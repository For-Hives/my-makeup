'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
	type FocusEvent,
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useId,
	useRef,
	useState,
} from 'react'
import { signOut } from '@/app/(front)/(dashboard)/auth/actions'
import { TrackedLink } from '@/components/analytics/TrackedLink'
import { IconPath } from '@/components/art/IconPath'
import { ICON_ARROW_RIGHT, ICON_CHEVRON_DOWN, ICON_CLOSE, ICON_MENU } from '@/components/art/icons'
import { pillClassName } from '@/components/art/pill-class'
import { SwirlEllipse } from '@/components/art/SwirlEllipse'
import { currentGroup, DASHBOARD_LINK, NAVIGATION, SEARCH_LINK, SIGN_IN_LINK } from './links'

const RING = 'focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2'
/** The two buttons at the right of the bar, in the pills of the art direction kit (docs/navbar.md). The kit's pill ring replaces `RING`. */
const SEARCH_PILL = `${pillClassName({ variant: 'outline', size: 'sm' })} hover:no-underline`
/** « Me connecter »: a soft indigo pill that keeps the single sliding underline of `.nav-link`, with the bar inset to the pill's padding. */
const SIGN_IN_PILL =
	'nav-link-strong rounded-full bg-indigo-50 px-5 after:inset-x-5 hover:bg-indigo-100 focus-visible:bg-indigo-100'
/** A hand that rests on a group this long opens it, and one that leaves it this long closes it: no flicker on the way across. */
const OPEN_DELAY = 90
const CLOSE_DELAY = 200
const isWide = () => window.matchMedia('(min-width: 1024px)').matches

function Chevron() {
	return <IconPath d={ICON_CHEVRON_DOWN} className="nav-chevron h-5 w-5" />
}

/**
 * Whether a makeup artist is signed in, asked of the server by the browser once the page has
 * loaded (ticket 078). The session cookie is HttpOnly and the page is static and shared: it can
 * neither read the cookie nor depend on it. Until the answer comes, and whenever it cannot come,
 * the visitor is taken for signed out, which is what a shared page says.
 */
function useSignedIn(pathname: string): boolean {
	const [signedIn, setSignedIn] = useState(false)
	// A new page asks again: the visitor may have signed in or out since the last one.
	useEffect(() => {
		const stop = new AbortController()
		fetch('/api/dashboard/session', { cache: 'no-store', credentials: 'same-origin', signal: stop.signal })
			.then(response => (response.ok ? response.json() : { signedIn: false }))
			.then((body: { signedIn?: unknown }) => setSignedIn(body.signedIn === true))
			.catch(() => {
				if (!stop.signal.aborted) setSignedIn(false)
			})
		return () => stop.abort()
	}, [pathname])
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
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
	const pointerType = useRef('mouse')
	const focusFirst = useRef(false)
	const ids = useId()
	const path = usePathname()
	/** The group that holds the current page: it is ringed by the ellipse like a plain entry on its own page. */
	const groupOfPage = currentGroup(path)
	const signedIn = useSignedIn(path)

	const settle = (next: string | null, delay: number) => {
		clearTimeout(timer.current)
		timer.current = setTimeout(() => setGroup(next), delay)
	}
	/** The hover of a mouse on a computer opens and closes the groups; a touch screen and a narrow window use the click. */
	const hover = (event: ReactPointerEvent<HTMLElement>, name: string | null) => {
		if (event.pointerType !== 'mouse' || !isWide()) return
		if (name === null) settle(null, CLOSE_DELAY)
		else settle(name, group === null ? OPEN_DELAY : 0)
	}

	useEffect(() => {
		clearTimeout(timer.current)
		setMenuOpen(false)
		setGroup(null)
	}, [path])

	useEffect(() => () => clearTimeout(timer.current), [])

	useEffect(() => {
		if (!focusFirst.current || group === null) return
		focusFirst.current = false
		root.current?.querySelector<HTMLElement>(`[data-panel="${group}"] a`)?.focus()
	}, [group])

	useEffect(() => {
		if (!menuOpen && group === null) return
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return
			clearTimeout(timer.current)
			if (group !== null) {
				root.current?.querySelector<HTMLElement>(`[data-group="${group}"]`)?.focus()
				setGroup(null)
			} else {
				menuButton.current?.focus()
				setMenuOpen(false)
			}
		}
		const onPointerDown = (event: PointerEvent) => {
			if (root.current && !root.current.contains(event.target as Node)) setGroup(null)
		}
		document.addEventListener('keydown', onKeyDown)
		document.addEventListener('pointerdown', onPointerDown)
		return () => {
			document.removeEventListener('keydown', onKeyDown)
			document.removeEventListener('pointerdown', onPointerDown)
		}
	}, [menuOpen, group])

	/** Arrows move through a group: down from its button enters it, up from its first link goes back to the button. */
	const onGroupKeyDown = (event: ReactKeyboardEvent<HTMLLIElement>, name: string) => {
		const trigger = event.currentTarget.querySelector<HTMLElement>('[data-group]')
		const links = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-panel] a')]
		const at = links.indexOf(event.target as HTMLElement)
		if (event.target === trigger) {
			if (event.key !== 'ArrowDown') return
			event.preventDefault()
			if (group === name) links[0]?.focus()
			else {
				focusFirst.current = true
				setGroup(name)
			}
			return
		}
		if (at === -1) return
		const target =
			event.key === 'ArrowDown'
				? links[Math.min(at + 1, links.length - 1)]
				: event.key === 'ArrowUp'
					? at === 0
						? trigger
						: links[at - 1]
					: event.key === 'Home'
						? links[0]
						: event.key === 'End'
							? links[links.length - 1]
							: undefined
		if (!target) return
		event.preventDefault()
		target.focus()
	}

	return (
		<header className="sticky top-0 z-30 border-gray-300 border-b bg-white">
			<nav
				ref={root}
				aria-label="Navigation principale"
				className="relative mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-x-10 px-6 py-3 lg:flex-nowrap lg:px-10 lg:py-5 xl:px-16"
			>
				<Link href="/" prefetch={false} data-cta="nav_logo" className={`-m-1.5 p-1.5 ${RING}`}>
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
					<IconPath d={menuOpen ? ICON_CLOSE : ICON_MENU} className="h-6 w-6" />
				</button>
				<div
					id="menu-principal"
					className={`${menuOpen ? 'flex' : 'hidden'} absolute inset-x-0 top-full max-h-[calc(100dvh-4.5rem)] flex-col gap-6 overflow-y-auto border-gray-300 border-b bg-white px-6 py-6 lg:static lg:flex lg:max-h-none lg:flex-1 lg:flex-row lg:items-center lg:justify-between lg:gap-10 lg:overflow-visible lg:border-0 lg:p-0`}
				>
					<ul className="flex flex-col gap-1 lg:flex-row lg:items-center lg:gap-2">
						{NAVIGATION.map((entry, entryIndex) => (
							<li
								key={entry.nom}
								className="lg:relative"
								{...('enfants' in entry
									? {
											onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => hover(event, entry.nom),
											onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => hover(event, null),
											onKeyDown: (event: ReactKeyboardEvent<HTMLLIElement>) => onGroupKeyDown(event, entry.nom),
											onBlur: (event: FocusEvent<HTMLLIElement>) => {
												if (!isWide() || group !== entry.nom) return
												const next = event.relatedTarget as Node | null
												if (next ? event.currentTarget.contains(next) : event.currentTarget.matches(':hover')) return
												setGroup(null)
											},
										}
									: {})}
							>
								{'href' in entry ? (
									<Link
										href={entry.href}
										data-cta={entry.cta}
										aria-current={path === entry.href ? 'page' : undefined}
										className={`nav-link ${RING}`}
									>
										{entry.nom}
										{path === entry.href && (
											<SwirlEllipse className="pointer-events-none absolute inset-x-0 inset-y-0 h-full w-full text-indigo-700" />
										)}
									</Link>
								) : (
									<>
										<button
											type="button"
											data-group={entry.nom}
											aria-expanded={group === entry.nom}
											aria-controls={`group-${entry.nom}`}
											onPointerDown={event => {
												pointerType.current = event.pointerType
											}}
											onClick={event => {
												clearTimeout(timer.current)
												// A mouse that has just opened the group by resting on it keeps it open on the click.
												const keepOpen =
													group === entry.nom && pointerType.current === 'mouse' && event.detail > 0 && isWide()
												setGroup(group === entry.nom && !keepOpen ? null : entry.nom)
											}}
											data-current-group={groupOfPage === entry.nom ? '' : undefined}
											className={`nav-link ${RING}`}
										>
											{entry.nom}
											<Chevron />
											{groupOfPage === entry.nom && (
												<SwirlEllipse className="pointer-events-none absolute inset-x-0 inset-y-0 h-full w-full text-indigo-700" />
											)}
										</button>
										<div
											id={`group-${entry.nom}`}
											data-panel={entry.nom}
											className={`${group === entry.nom ? 'block' : 'hidden'} nav-panel lg:absolute lg:top-full lg:left-0 lg:w-96`}
										>
											<ul className="nav-panel-card flex flex-col gap-1">
												{entry.enfants.map((child, childIndex) => (
													<li key={child.href}>
														<Link
															href={child.href}
															data-cta={child.cta}
															aria-labelledby={`${ids}-${entryIndex}-${childIndex}`}
															aria-current={path === child.href ? 'page' : undefined}
															className={`nav-sub ${RING}`}
														>
															<span id={`${ids}-${entryIndex}-${childIndex}`} className="nav-sub-title">
																{child.nom}
															</span>
															<span className="mt-1 block text-gray-600 text-sm">{child.description}</span>
														</Link>
													</li>
												))}
											</ul>
										</div>
									</>
								)}
							</li>
						))}
					</ul>
					<div className="flex flex-col items-start gap-4 lg:flex-row lg:items-center lg:gap-4 xl:gap-6">
						<TrackedLink href={SEARCH_LINK.href} suivi={{ nom: 'nav_recherche' }} className={SEARCH_PILL}>
							{SEARCH_LINK.nom}
							<IconPath d={ICON_ARROW_RIGHT} className="art-arrow h-5 w-5" />
						</TrackedLink>
						{signedIn ? (
							<>
								<Link href={DASHBOARD_LINK.href} data-cta="nav_espace" className={`nav-link ${RING}`}>
									{DASHBOARD_LINK.nom}
								</Link>
								<form action={signOut}>
									<button type="submit" className={`nav-link ${SIGN_IN_PILL} ${RING}`}>
										Me déconnecter
									</button>
								</form>
							</>
						) : (
							<Link href={SIGN_IN_LINK.href} data-cta="nav_connexion" className={`nav-link ${SIGN_IN_PILL} ${RING}`}>
								{SIGN_IN_LINK.nom}
							</Link>
						)}
					</div>
				</div>
			</nav>
		</header>
	)
}

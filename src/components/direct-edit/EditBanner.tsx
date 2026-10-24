import Link from 'next/link'
import type { EditBanner as Banner } from '@/lib/dashboard/edit-banner'

const LINK =
	'inline-flex min-h-11 items-center gap-2 rounded-full border border-nude-300 bg-white px-4 font-medium text-ink text-sm underline-offset-4 hover:border-lipstick hover:underline focus-visible:outline-2 focus-visible:outline-lipstick focus-visible:outline-offset-2'

/**
 * The banner at the top of her page in edit mode (issue 1072): where her page stands for everyone, and, while it
 * is not visible, the list of everything that is missing, each point a link of 44 px to the block that completes
 * it. It is drawn from what the server read of her stored profile, so after a save (the page is read again) the
 * points done are gone and, with the last one, it reads « Ton profil est visible ». A page the team hid or
 * suspended has its own words and no list. A state is told by words and an icon, never by a colour alone.
 */
export function EditBanner({ banner }: { banner: Banner }) {
	return (
		<section
			aria-label="Où en est ton profil"
			data-testid="edit-banner"
			data-state={banner.state}
			className="border-hairline border-b bg-white font-body"
		>
			<div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 md:px-8">{content(banner)}</div>
		</section>
	)
}

function content(banner: Banner) {
	if (banner.state === 'draft' || banner.state === 'incomplete') {
		return (
			<>
				<p className="flex items-start gap-2 text-base text-ink">
					<Icon kind="alert" />
					<span>
						<strong className="font-semibold">Ton profil n’est pas encore visible.</strong> Il manque :
					</span>
				</p>
				<ul className="flex flex-wrap gap-2" data-testid="edit-banner-missing">
					{banner.items.map(item => (
						<li key={item.criterion}>
							<Link href={item.href} className={LINK} data-testid={`missing-${item.criterion}`}>
								<span aria-hidden="true" className="size-3 shrink-0 rounded-full border-2 border-lipstick-800" />
								{item.label}
							</Link>
						</li>
					))}
				</ul>
			</>
		)
	}
	if (banner.state === 'publishable') {
		return (
			<p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-base text-ink">
				<span className="flex items-center gap-2 font-semibold text-ok">
					<Icon kind="check" />
					Ton profil est visible
				</span>
				{banner.paused ? (
					<span className="text-mute text-sm">Tu es en pause : tu n’apparais pas dans la recherche.</span>
				) : null}
				<Link href={banner.href} className={LINK}>
					Voir ma page publique
				</Link>
			</p>
		)
	}
	if (!('note' in banner)) return null
	const title =
		banner.state === 'suspended'
			? 'Ton profil est suspendu par l’équipe'
			: banner.state === 'hidden'
				? 'Ton profil est masqué par l’équipe'
				: 'Compte interne My Makeup'
	return (
		<p className="flex items-start gap-2 text-base text-ink">
			<Icon kind="alert" />
			<span>
				<strong className="font-semibold">{title}.</strong> {banner.note}
			</span>
		</p>
	)
}

function Icon({ kind }: { kind: 'alert' | 'check' }) {
	return (
		<svg
			aria-hidden="true"
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2.2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className="mt-0.5 shrink-0"
		>
			{kind === 'check' ? (
				<path d="M5 12.5l4.5 4.5L19 7.5" />
			) : (
				<>
					<circle cx="12" cy="12" r="9" />
					<path d="M12 7v6M12 16.5v.5" />
				</>
			)}
		</svg>
	)
}

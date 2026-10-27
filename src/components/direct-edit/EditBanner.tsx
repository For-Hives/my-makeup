import Link from 'next/link'
import { Icon } from '@/components/art/Icon'
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
					<KindIcon kind="alert" />
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
			<>
				<p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-base text-ink">
					<span className="flex items-center gap-2 font-semibold text-ok">
						<KindIcon kind="check" />
						Ton profil est visible
					</span>
					{banner.paused ? (
						<span className="text-mute text-sm">Tu es en pause : tu n’apparais pas dans la recherche.</span>
					) : null}
					{/* No prefetch: the public page is cached and shared, her own page must not warm it. */}
					<Link href={banner.href} prefetch={false} className={LINK}>
						Voir ma page publique
					</Link>
				</p>
				{banner.google.length > 0 ? (
					<>
						<p className="text-base text-ink">
							<strong className="font-semibold">Pour apparaître sur Google</strong>, tu peux ajouter (facultatif) :
						</p>
						<ul className="flex flex-wrap gap-2" data-testid="edit-banner-google">
							{banner.google.map(item => (
								<li key={item.criterion}>
									<Link href={item.href} className={LINK} data-testid={`google-${item.criterion}`}>
										<span aria-hidden="true" className="size-3 shrink-0 rounded-full border-2 border-nude-300" />
										{item.label}
									</Link>
								</li>
							))}
						</ul>
					</>
				) : null}
			</>
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
			<KindIcon kind="alert" />
			<span>
				<strong className="font-semibold">{title}.</strong> {banner.note}
			</span>
		</p>
	)
}

function KindIcon({ kind }: { kind: 'alert' | 'check' }) {
	return <Icon name={kind === 'check' ? 'check' : 'alert-circle'} className="mt-0.5 h-5 w-5 shrink-0" />
}

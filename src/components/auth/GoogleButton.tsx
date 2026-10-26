import Image from 'next/image'
import { GOOGLE_START_PATH } from '@/lib/auth/google/config'
import { GoogleLink } from './GoogleLink'

/**
 * The Google button of the sign-in and sign-up pages (tickets 090 and 091), with the words and the
 * logo of the current site. A plain link, not a `Link` of Next: the address starts a sign-in, and
 * must not be loaded ahead of a click. `retour` is the page to come back to, already a path of this
 * site; the sign-up page gives none, and a click there starts a sign-up (`signup_start`).
 */
export function GoogleButton({ libelle, retour }: { libelle: string; retour?: string }) {
	const address = retour ? `${GOOGLE_START_PATH}?callbackUrl=${encodeURIComponent(retour)}` : GOOGLE_START_PATH
	return (
		<div className="flex w-full max-w-sm flex-col items-center gap-4">
			<GoogleLink
				adresse={address}
				debutDInscription={retour === undefined}
				className="flex min-h-13 w-full flex-nowrap items-center justify-center gap-6 rounded-full bg-white px-5 ring-1 ring-art-line ring-inset hover:bg-art-blush-50"
			>
				<Image
					src="/assets/signin-assets/google_logo.svg"
					alt=""
					width={18}
					height={18}
					className="h-[18px] w-[18px]"
				/>
				<span className="font-[family-name:Roboto,ui-sans-serif,system-ui,sans-serif] font-medium text-[14px] text-black/[54%]">
					{libelle}
				</span>
			</GoogleLink>
			<div className="flex w-full items-center gap-3 text-mute text-sm">
				<span className="h-px flex-1 bg-art-line" />
				<span>Ou</span>
				<span className="h-px flex-1 bg-art-line" />
			</div>
		</div>
	)
}

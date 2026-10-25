import { ArtCta } from '@/components/art/ArtCta'
import { TitleAccent } from '@/components/art/TitleWithCapsules'

/**
 * The call to action that closes the pages: look for a makeup artist, or be one (issue 1067), in the look of the kit
 * (`ArtCta`: a white frame, a large night panel, the real WebGL backdrop that moves only when it can, a Bodoni title,
 * two pills, a lot of room around). The texts and the two measured clicks are those of the earlier block. The
 * lipstick red is not used: it is for what a makeup artist can change.
 */
export function Cta() {
	return (
		<ArtCta
			title={
				<>
					Rejoignez <span className="whitespace-nowrap">My-Makeup</span>, la{' '}
					<TitleAccent tone="ink" italic>
						communauté
					</TitleAccent>{' '}
					qui fait la différence.
				</>
			}
			primary={{ href: '/search', label: 'Trouver ma maquilleuse', where: 'cta_recherche' }}
			secondary={{ href: '/auth/signup', label: 'Je suis maquilleuse', where: 'cta_inscription' }}
		>
			Que vous cherchiez une maquilleuse ou que vous le soyez : la recherche est gratuite, et la page professionnelle
			l&apos;est aussi.
		</ArtCta>
	)
}

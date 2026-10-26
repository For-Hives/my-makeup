import { ARTIST_BENEFITS } from './artist-texts'
import { ARTIST_PALETTE, Benefits } from './Benefits'

/** The advantages of joining, on « Pourquoi rejoindre My-Makeup en tant que maquilleuse ». */
export function ArtistBenefits() {
	return <Benefits eyebrow="Maquilleuse" items={ARTIST_BENEFITS} palette={ARTIST_PALETTE} />
}

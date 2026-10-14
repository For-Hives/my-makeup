import { lignes } from '@/lib/profil/vue-publique'
import type { ProfilPublic } from '@/services/public/profils'
import { EnTeteDuProfil } from './EnTeteDuProfil'
import { SectionDuProfil } from './SectionDuProfil'

/**
 * The content of the page of a profile (tickets 101 to 103): the top, then the cards that have
 * something to show. It reads the profile it is given and nothing else, so a test renders it
 * without a database, and the HTML of the server holds all of it.
 */
export function VueDuProfil({ profil }: { profil: ProfilPublic }) {
	const description = lignes(profil.description)
	return (
		<main className="flex flex-1 flex-col">
			<EnTeteDuProfil profil={profil} />
			<div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 md:px-8">
				<div className="flex flex-col gap-5">
					{description.length > 0 && (
						<SectionDuProfil titre="Vous en quelques mots">
							{description.map((ligne, rang) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: the lines are fixed text, never reordered
								<p key={`${rang}-${ligne}`} className="break-words text-gray-800">
									{ligne}
								</p>
							))}
						</SectionDuProfil>
					)}
				</div>
			</div>
		</main>
	)
}

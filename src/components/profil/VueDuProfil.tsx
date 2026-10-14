import { lignes } from '@/lib/profil/vue-publique'
import type { ProfilPublic } from '@/services/public/profils'
import { EnTeteDuProfil } from './EnTeteDuProfil'
import {
	SectionCompetences,
	SectionContacts,
	SectionDescription,
	SectionExperiences,
	SectionFormations,
	SectionLangues,
	SectionLocalisation,
	SectionPrestations,
} from './SectionsDuProfil'

/**
 * The content of the page of a profile (tickets 101 to 103): the top, then the cards that have
 * something to show, in two columns as on the site today. A card with nothing to show is left out,
 * title included. It reads the profile it is given and nothing else, so a test renders it without a
 * database, and the HTML of the server holds all of it.
 */
export function VueDuProfil({ profil }: { profil: ProfilPublic }) {
	const description = lignes(profil.description)
	return (
		<main className="flex flex-1 flex-col">
			<EnTeteDuProfil profil={profil} />
			<div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 md:px-8">
				<div className="grid grid-cols-12 gap-5">
					<div className="col-span-12 flex min-w-0 flex-col items-start gap-5 md:col-span-4">
						{profil.lieu && <SectionLocalisation lieu={profil.lieu} seDeplace={profil.seDeplace} zone={profil.zone} />}
						{profil.liens.length > 0 && <SectionContacts liens={profil.liens} />}
						{profil.competences.length > 0 && <SectionCompetences competences={profil.competences} />}
						{profil.langues.length > 0 && <SectionLangues langues={profil.langues} />}
						{profil.formations.length > 0 && <SectionFormations formations={profil.formations} />}
					</div>
					<div className="col-span-12 flex min-w-0 flex-col items-start gap-5 md:col-span-8">
						{description.length > 0 && <SectionDescription lignes={description} />}
						{profil.prestations.length > 0 && <SectionPrestations prestations={profil.prestations} />}
						{profil.experiences.length > 0 && <SectionExperiences experiences={profil.experiences} />}
					</div>
				</div>
			</div>
		</main>
	)
}

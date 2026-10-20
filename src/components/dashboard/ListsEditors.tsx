'use client'

import { EXPERIENCES } from '@/lib/dashboard/experiences'
import { FORMATIONS } from '@/lib/dashboard/courses'
import type { LigneEnregistree } from '@/lib/dashboard/list'
import { PRESTATIONS } from '@/lib/dashboard/service-offers'
import { EditeurDeListe, type EnvoiDeLaListe } from './ListEditor'

interface Proprietes {
	lignes: readonly LigneEnregistree[]
	envoyer: EnvoiDeLaListe
}

/** The panel of her experiences (ticket 129). */
export function EditeurDExperiences({ lignes, envoyer }: Proprietes) {
	return (
		<EditeurDeListe
			definition={EXPERIENCES}
			lignes={lignes}
			envoyer={envoyer}
			libelleDuBouton="Modifier mes expériences"
			titre="Modifier mes expériences"
			annonceEnregistre="Tes expériences sont enregistrées."
		/>
	)
}

/** The panel of her courses (ticket 130). */
export function EditeurDeFormations({ lignes, envoyer }: Proprietes) {
	return (
		<EditeurDeListe
			definition={FORMATIONS}
			lignes={lignes}
			envoyer={envoyer}
			libelleDuBouton="Modifier mes formations"
			titre="Modifier mes formations"
			annonceEnregistre="Tes formations sont enregistrées."
		/>
	)
}

/** The panel of her offers (ticket 131). */
export function EditeurDePrestations({ lignes, envoyer }: Proprietes) {
	return (
		<EditeurDeListe
			definition={PRESTATIONS}
			lignes={lignes}
			envoyer={envoyer}
			libelleDuBouton="Modifier mes prestations"
			titre="Modifier mes prestations"
			annonceEnregistre="Tes prestations sont enregistrées."
		/>
	)
}

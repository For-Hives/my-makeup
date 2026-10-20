'use client'

import { COURSES } from '@/lib/dashboard/courses'
import { EXPERIENCES } from '@/lib/dashboard/experiences'
import type { SavedRow } from '@/lib/dashboard/list'
import { SERVICE_OFFERS } from '@/lib/dashboard/service-offers'
import { ListEditor, type ListUpload } from './ListEditor'

interface Props {
	lignes: readonly SavedRow[]
	envoyer: ListUpload
}

/** The panel of her experiences (ticket 129). */
export function ExperiencesEditor({ lignes, envoyer }: Props) {
	return (
		<ListEditor
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
export function CoursesEditor({ lignes, envoyer }: Props) {
	return (
		<ListEditor
			definition={COURSES}
			lignes={lignes}
			envoyer={envoyer}
			libelleDuBouton="Modifier mes formations"
			titre="Modifier mes formations"
			annonceEnregistre="Tes formations sont enregistrées."
		/>
	)
}

/** The panel of her offers (ticket 131). */
export function ServiceOffersEditor({ lignes, envoyer }: Props) {
	return (
		<ListEditor
			definition={SERVICE_OFFERS}
			lignes={lignes}
			envoyer={envoyer}
			libelleDuBouton="Modifier mes prestations"
			titre="Modifier mes prestations"
			annonceEnregistre="Tes prestations sont enregistrées."
		/>
	)
}

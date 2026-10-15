'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { installerLaMesure } from '@/lib/analytics/chargeur'
import { aEmettre, navigateurReel, soumissionDuFormulaire } from '@/lib/analytics/doublon'
import type { EvenementsMyMakeup } from '@/lib/analytics/events'
import { track } from '@/lib/analytics/track'
import { codeDErreur, genreDePageIntrouvable } from '@/lib/analytics/valeurs'

/**
 * The search page counted once (event `search_submit`, ticket 145). The server gives two facts and
 * nothing else: whether a city was typed, and the slice of the results. `empreinte` tells two
 * searches apart (it is a hash made on the server, the words never reach the browser's storage).
 * Renders nothing.
 */
export function MesureDeRecherche({
	aUneVille,
	resultats,
	empreinte,
}: {
	aUneVille: boolean
	resultats: EvenementsMyMakeup['search_submit']['results']
	empreinte: string
}) {
	useEffect(() => {
		const navigateur = navigateurReel()
		const formulaire = soumissionDuFormulaire(navigateur)
		if (!aEmettre('search_submit', empreinte, 'meme-vue', navigateur) && !formulaire) return
		track('search_submit', { has_city: aUneVille, results: resultats, from: formulaire ? 'formulaire' : 'lien' })
	}, [aUneVille, resultats, empreinte])
	return null
}

/** The 404 page counted once, with the kind of address it was (event `not_found`). Renders nothing. */
export function MesureDePageIntrouvable() {
	const chemin = usePathname()
	useEffect(() => {
		installerLaMesure()
		if (aEmettre('not_found', chemin, 'rechargement', navigateurReel()))
			track('not_found', { kind: genreDePageIntrouvable(chemin) })
	}, [chemin])
	return null
}

/** An error page counted once (event `app_error`). Renders nothing. */
export function MesureDErreur({
	scope,
	erreur,
}: {
	scope: EvenementsMyMakeup['app_error']['scope']
	erreur: Error & { digest?: string }
}) {
	useEffect(() => {
		// The digest names the error of the server; a client error has none, its message is not read.
		installerLaMesure()
		const vue = `${scope}:${erreur.digest ?? ''}:${window.location.pathname}`
		if (aEmettre('app_error', vue, 'rechargement', navigateurReel()))
			track('app_error', { scope, code: codeDErreur(erreur) })
	}, [scope, erreur])
	return null
}

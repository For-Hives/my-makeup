/**
 * What the preview of her own page tells her (ticket 139; plan 01 §3.3 P7.1): where her profile
 * stands for a visitor, in one banner. Pure, so the page and the tests call it.
 *
 * The three rules are the ones of the public reading, never written again here
 * (src/lib/profile/visibility.ts): visible at its address, listed, indexable. The first condition
 * that fails gives the message, from the most serious to the lightest.
 */

import { type DocumentVisible, isIndexable, isList, isVisible } from '../profile/visibility'

export const PREVIEW_PATH = '/auth/apercu-profil'
export const DASHBOARD_PATH = '/auth/profil'

export type PreviewCode = 'masque' | 'vide' | 'indisponible' | 'non-publiable' | 'complet'

export interface PreviewState {
	readonly code: PreviewCode
	/** Short text in bold. */
	readonly titre: string
	/** The explanation under it. */
	readonly texte: string
}

/** The banner for the state of her profile. */
export function previewState(profil: DocumentVisible): PreviewState {
	if (!isVisible(profil))
		return {
			code: 'masque',
			titre: 'Ton profil est masqué.',
			texte:
				'Les visiteuses ne le voient pas : cette page n’existe que pour toi. Écris-nous si tu penses que c’est une erreur.',
		}
	if (!isList(profil) && profil.available !== false)
		return {
			code: 'vide',
			titre: 'Ton profil est encore vide.',
			texte: 'Il n’apparaît pas dans les listes ni dans la recherche. Complète-le pour qu’il soit affiché.',
		}
	if (profil.available === false)
		return {
			code: 'indisponible',
			titre: 'Tu es indisponible.',
			texte:
				'Ton profil n’apparaît pas dans les résultats de recherche, mais cette page reste visible par celles qui ont ton lien.',
		}
	if (!isIndexable(profil))
		return {
			code: 'non-publiable',
			titre: 'Ton profil n’est pas encore publiable.',
			texte:
				'Cette page est visible par celles qui ont ton lien, mais les moteurs de recherche ne la référencent pas encore.',
		}
	return {
		code: 'complet',
		titre: 'C’est ta page telle que les visiteuses la voient.',
		texte: 'Toi seule vois ce bandeau.',
	}
}

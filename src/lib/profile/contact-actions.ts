/**
 * The actions of the sheet « Contacter <prénom> » of a profile (ticket 290): one wide button per way of
 * reaching the artist that leads somewhere. Pure functions, so a test reads them without a page.
 *
 * The name of each action says what it does (« Appeler Inès », « Instagram d’Inès »), and the line
 * under it says where it leads in a few characters (« @ines.morel », « ines-morel.fr »), never the whole
 * address. The contact details come from the public reading, which gives them only when the artist
 * published them: nothing here decides that.
 */

import { ofName } from '../french-elision'
import { NEUTRAL_NAME } from './display-name'
import type { Channel, ContactLink } from './public-view'

/** One button of the sheet. Plain data: it crosses from the server to the browser. */
export interface ContactAction {
	canal: Channel
	href: string
	/** What the button does: « Appeler Inès ». */
	title: string
	/** Where it leads, short: « 06 39 98 10 01 », « @ines.morel ». */
	detail: string
	/** Networks and websites open in a new tab; an email and a telephone do not. */
	newTab: boolean
}

/** The order of the sheet: the quickest ways first. */
const ORDER: readonly Channel[] = ['phone', 'email', 'instagram', 'facebook', 'linkedin', 'youtube', 'website']

const NEW_TAB: ReadonlySet<Channel> = new Set(['instagram', 'facebook', 'linkedin', 'youtube', 'website'])

const NETWORK_NAMES = {
	instagram: 'Instagram',
	facebook: 'Facebook',
	linkedin: 'LinkedIn',
	youtube: 'YouTube',
} as const

/** The word that stands for her in the texts of the sheet when she gave no first name. */
const SOMEONE = 'la maquilleuse'

/**
 * The name the page uses to speak of her: her first name, else the name of the h1 (her artist name),
 * and `null` for the neutral label, which names nobody.
 */
export function contactName(profil: { firstName: string | null; nom: string }): string | null {
	if (profil.firstName !== null) return profil.firstName
	return profil.nom === NEUTRAL_NAME ? null : profil.nom
}

/** « Inès » stays « Inès », and nobody becomes « la maquilleuse ». */
export const subjectOf = (name: string | null): string => name ?? SOMEONE

/** « d’Inès », « de Léa », or « de la maquilleuse ». */
export const possessorOf = (name: string | null): string => (name === null ? `de ${SOMEONE}` : ofName(name))

function titleOf(canal: Channel, name: string | null): string {
	if (canal === 'phone') return `Appeler ${subjectOf(name)}`
	if (canal === 'email') return `Écrire à ${subjectOf(name)}`
	if (canal === 'website') return `Site ${possessorOf(name)}`
	return `${NETWORK_NAMES[canal]} ${possessorOf(name)}`
}

/** The buttons of the sheet, from the links the profile shows: only those that lead somewhere. */
export function contactActions(liens: readonly ContactLink[], name: string | null): ContactAction[] {
	return ORDER.flatMap(canal => {
		const link = liens.find(candidate => candidate.canal === canal)
		if (!link?.href) return []
		return [{ canal, href: link.href, title: titleOf(canal, name), detail: link.affichage, newTab: NEW_TAB.has(canal) }]
	})
}

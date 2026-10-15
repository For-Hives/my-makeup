/**
 * The click on a way of reaching the artist, on a public profile (ticket 144): one `contact_click`
 * event per click, with the profile and the channel.
 *
 * Nothing is sent (U84) when the visitor is the artist herself, when she comes from her space
 * (`/auth/...`), or when she follows a reminder link (`utm_campaign=relance`): those clicks are not
 * demand, and the event is the main signal of it.
 */

import type { Pid } from './events'
import type { Suivre } from './track'

export type CanalDeContact = 'email' | 'phone' | 'instagram' | 'facebook' | 'linkedin' | 'youtube' | 'website'

/** Where the click happens, as the browser tells it. */
export interface LieuDuClic {
	/** `location.search` */
	recherche: string
	/** `document.referrer` */
	referent: string
	/** `location.origin` */
	origine: string
}

/** True when the page was reached from the space of an artist (a same-site `/auth/...` page). */
function vientDeLEspace({ referent, origine }: Pick<LieuDuClic, 'referent' | 'origine'>): boolean {
	if (referent === '' || !URL.canParse(referent)) return false
	const adresse = new URL(referent)
	return adresse.origin === origine && (adresse.pathname === '/auth' || adresse.pathname.startsWith('/auth/'))
}

/** True when the address carries the campaign of the reminder emails. */
function vientDUneRelance(recherche: string): boolean {
	return new URLSearchParams(recherche).get('utm_campaign')?.toLowerCase() === 'relance'
}

/** U84: whether a click on a contact of the profile `pid` is to be counted. */
export function clicAMesurer({
	pid,
	pidDeLaVisiteuse,
	...lieu
}: LieuDuClic & { pid: Pid | null; pidDeLaVisiteuse: Pid | null }): boolean {
	if (pid === null) return false
	if (pidDeLaVisiteuse !== null && pidDeLaVisiteuse === pid) return false
	return !vientDeLEspace(lieu) && !vientDUneRelance(lieu.recherche)
}

/**
 * Counts one click. `monPid` is the answer of the server about the visitor, which may still be on its
 * way when the click comes: the click waits for it. A visitor the server cannot tell is counted as
 * anyone. True when the event was handed to Umami.
 */
export async function mesurerUnClicDeContact(clic: {
	pid: Pid | null
	canal: CanalDeContact
	lieu: LieuDuClic
	monPid: Promise<Pid | null>
	suivre: Suivre
}): Promise<boolean> {
	const { pid, canal, lieu, suivre } = clic
	if (pid === null) return false
	const pidDeLaVisiteuse = await clic.monPid.catch(() => null)
	if (!clicAMesurer({ pid, pidDeLaVisiteuse, ...lieu })) return false
	return suivre('contact_click', { pid, channel: canal })
}

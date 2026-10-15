/**
 * R06 (plan 02 §7.6, ticket 156): the certificates of the site, of the photos and of Umami stay valid
 * more than 21 days, and their domains stay registered more than 30 days.
 *
 * - A certificate is read by a TLS handshake on port 443 of a fixed list of hosts, and nothing is sent
 *   on it: no request, no data. This is the one connection the probes open outside the guard
 *   (tests/sondes/garde.ts), and the only code that does (a test keeps it so). A certificate the
 *   handshake refuses (expired, wrong host) is red.
 * - A domain's end date comes from the public registry (RDAP), read by GET through the guard, one
 *   registry at a time. A registry that does not answer, or does not give the date, makes the line
 *   `inconnu`, not `vert`.
 *
 * The hosts are those of the target and of the services it lives on, never read from a page.
 */

import tls from 'node:tls'
import { MEDIA_ORIGIN_DEFAULT, UMAMI_ORIGIN_DEFAULT } from '../../src/lib/env'
import { SITE_ORIGIN } from '../../src/lib/urls-gelees'
import { garder, RequeteInterdite, type Transport } from './garde'
import { creerLecteur, HORLOGE_REELLE, type Horloge, type Lecteur } from './lecteur'
import { type Constat, pire, raisonDe, type Verdict } from './resultat'

/** A certificate under this many days is an alert. */
export const SEUIL_CERTIFICAT_JOURS = 21
/** A domain under this many days from its end date is an alert. */
export const SEUIL_DOMAINE_JOURS = 30

const JOUR_MS = 24 * 60 * 60 * 1000
const DELAI_DE_LA_POIGNEE_MS = 10_000

/** Days from `maintenant` to `fin`, fractions kept. */
export const joursRestants = (fin: Date, maintenant: Date): number => (fin.getTime() - maintenant.getTime()) / JOUR_MS

/** Reads the end date of the certificate a host presents, or throws with the reason the handshake gave. */
export type LireUnCertificat = (hote: string) => Promise<Date>

/**
 * The real reader: a TLS handshake that checks the chain and the name, reads the end date of the
 * certificate and closes. `options` are for a test with its own authority.
 */
export const lireLeCertificat =
	(options: Pick<tls.ConnectionOptions, 'ca' | 'port'> = {}): LireUnCertificat =>
	hote =>
		new Promise<Date>((resolve, reject) => {
			const socket = tls.connect({ host: hote, servername: hote, port: 443, rejectUnauthorized: true, ...options })
			const abandon = setTimeout(() => {
				socket.destroy()
				reject(new Error(`aucune réponse en ${DELAI_DE_LA_POIGNEE_MS / 1000} s`))
			}, DELAI_DE_LA_POIGNEE_MS)
			socket.once('secureConnect', () => {
				clearTimeout(abandon)
				const { valid_to } = socket.getPeerCertificate()
				socket.end()
				const fin = new Date(valid_to)
				if (Number.isNaN(fin.getTime())) reject(new Error('date de fin illisible'))
				else resolve(fin)
			})
			socket.once('error', (erreur: Error) => {
				clearTimeout(abandon)
				reject(erreur)
			})
		})

/** The hosts whose certificate is read, and the domains whose end date is read. */
export interface Surveillance {
	hotes: string[]
	domaines: string[]
}

/** `a.b.example.fr` -> `example.fr`: every domain the project owns is a registered name plus a TLD. */
export const domaineEnregistre = (hote: string): string => hote.split('.').slice(-2).join('.')

/**
 * What to watch for a target: the site (and `www` for the real one, which redirects to it), the Strapi API
 * while it runs, the host of the photos and the one of Umami. Nothing for a target that is not https.
 */
export function surveillanceDe(cible: URL, api?: URL): Surveillance | undefined {
	if (cible.protocol !== 'https:') return undefined
	const hotes = [
		cible.hostname,
		...(cible.origin === SITE_ORIGIN ? [`www.${cible.hostname}`] : []),
		...(api?.protocol === 'https:' ? [api.hostname] : []),
		new URL(MEDIA_ORIGIN_DEFAULT).hostname,
		new URL(UMAMI_ORIGIN_DEFAULT).hostname,
	]
	const uniques = [...new Set(hotes)]
	return { hotes: uniques, domaines: [...new Set(uniques.map(domaineEnregistre))] }
}

/** RDAP servers by TLD (the IANA bootstrap lists them; the project owns .fr names). */
const SERVEURS_RDAP: Record<string, string> = {
	fr: 'https://rdap.nic.fr',
	com: 'https://rdap.verisign.com/com/v1',
}

/** The end date a registry's RDAP answer gives, or nothing. */
export function finDeLEnregistrement(corps: string): Date | undefined {
	let donnees: unknown
	try {
		donnees = JSON.parse(corps)
	} catch {
		return undefined
	}
	if (typeof donnees !== 'object' || donnees === null || !('events' in donnees) || !Array.isArray(donnees.events))
		return undefined
	for (const evenement of donnees.events as unknown[]) {
		if (typeof evenement !== 'object' || evenement === null) continue
		const { eventAction, eventDate } = evenement as Record<string, unknown>
		if (eventAction === 'expiration' && typeof eventDate === 'string') {
			const fin = new Date(eventDate)
			if (!Number.isNaN(fin.getTime())) return fin
		}
	}
	return undefined
}

/** Reads the RDAP record of a domain: a GET through the guard, or nothing when no registry is known for its TLD. */
export type LireUnDomaine = (domaine: string) => Promise<{ statut: number; corps: string } | undefined>

export function lecteurRdap(transport?: Transport, horloge: Horloge = HORLOGE_REELLE): LireUnDomaine {
	const lecteurs = new Map<string, Lecteur>()
	return async domaine => {
		const base = SERVEURS_RDAP[domaine.split('.').at(-1) ?? '']
		if (!base) return undefined
		const { origin, pathname } = new URL(base)
		let lecteur = lecteurs.get(origin)
		if (!lecteur) {
			lecteur = creerLecteur({ lecture: garder(new URL(origin), transport), horloge })
			lecteurs.set(origin, lecteur)
		}
		const { statut, corps } = await lecteur.lire(`${pathname.replace(/\/$/, '')}/domain/${domaine}`)
		return { statut, corps }
	}
}

const jours = (valeur: number): string => `${Math.floor(valeur)} jour${Math.floor(valeur) > 1 ? 's' : ''}`

export interface OptionsR06 {
	surveillance: Surveillance
	certificat: LireUnCertificat
	domaine: LireUnDomaine
	maintenant: () => Date
}

export async function sondeR06({ surveillance, certificat, domaine, maintenant }: OptionsR06): Promise<Constat> {
	const verdicts: Verdict[] = []
	const constats: string[] = []

	for (const hote of surveillance.hotes) {
		try {
			const restants = joursRestants(await certificat(hote), maintenant())
			const ok = restants >= SEUIL_CERTIFICAT_JOURS
			verdicts.push(ok ? 'vert' : 'rouge')
			constats.push(
				`certificat de ${hote} : ${restants < 0 ? 'expiré' : `valable encore ${jours(restants)}`}${ok ? '' : ` (alerte sous ${SEUIL_CERTIFICAT_JOURS} jours)`}`
			)
		} catch (erreur) {
			verdicts.push('rouge')
			constats.push(`certificat de ${hote} : refusé (${erreur instanceof Error ? erreur.message : 'erreur inconnue'})`)
		}
	}

	for (const nom of surveillance.domaines) {
		try {
			const reponse = await domaine(nom)
			if (!reponse) {
				verdicts.push('inconnu')
				constats.push(`domaine ${nom} : pas de registre connu pour cette extension, fin non lue`)
				continue
			}
			const fin = reponse.statut === 200 ? finDeLEnregistrement(reponse.corps) : undefined
			if (!fin) {
				verdicts.push('inconnu')
				constats.push(
					`domaine ${nom} : fin d’enregistrement non lue (registre : réponse ${reponse.statut}${reponse.statut === 200 ? ', sans date de fin' : ''})`
				)
				continue
			}
			const restants = joursRestants(fin, maintenant())
			const ok = restants >= SEUIL_DOMAINE_JOURS
			verdicts.push(ok ? 'vert' : 'rouge')
			constats.push(
				`domaine ${nom} : ${restants < 0 ? 'échu' : `enregistré encore ${jours(restants)}`}${ok ? '' : ` (alerte sous ${SEUIL_DOMAINE_JOURS} jours)`}`
			)
		} catch (erreur) {
			if (erreur instanceof RequeteInterdite) throw erreur
			verdicts.push('inconnu')
			constats.push(`domaine ${nom} : registre injoignable (${raisonDe(erreur)})`)
		}
	}
	return { verdict: pire(verdicts), constats }
}

/**
 * R06 (plan 02 §7.6, ticket 156): the certificates of the site, of the photos and of Umami stay valid
 * more than 21 days, and their domains stay registered more than 30 days.
 *
 * - A certificate is read by a TLS handshake on port 443 of a fixed list of hosts, and nothing is sent
 *   on it: no request, no data. This is the one connection the probes open outside the guard
 *   (tests/probes/guard.ts), and the only code that does (a test keeps it so). A certificate the
 *   handshake refuses (expired, wrong host) is red.
 * - A domain's end date comes from the public registry (RDAP), read by GET through the guard, one
 *   registry at a time. A registry that does not answer, or does not give the date, makes the line
 *   `inconnu`, not `vert`.
 *
 * The hosts are those of the target and of the services it lives on, never read from a page.
 */

import tls from 'node:tls'
import { MEDIA_ORIGIN_DEFAULT, UMAMI_ORIGIN_DEFAULT } from '../../src/lib/env'
import { SITE_ORIGIN } from '../../src/lib/frozen-urls'
import { ForbiddenRequest, keep, type Transport } from './guard'
import { type Clock, createReader, REAL_CLOCK, type Reader } from './reader'
import { type Finding, reasonOf, type Verdict, worst } from './result'

/** A certificate under this many days is an alert. */
export const THRESHOLD_CERTIFICATE_DAYS = 21
/** A domain under this many days from its end date is an alert. */
export const THRESHOLD_DOMAIN_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000
const HANDSHAKE_DELAY_MS = 10_000

/** Days from `maintenant` to `fin`, fractions kept. */
export const remainingDays = (fin: Date, maintenant: Date): number => (fin.getTime() - maintenant.getTime()) / DAY_MS

/** Reads the end date of the certificate a host presents, or throws with the reason the handshake gave. */
export type ReadCertificate = (hote: string) => Promise<Date>

/**
 * The real reader: a TLS handshake that checks the chain and the name, reads the end date of the
 * certificate and closes. `options` are for a test with its own authority.
 */
export const readCertificate =
	(options: Pick<tls.ConnectionOptions, 'ca' | 'port'> = {}): ReadCertificate =>
	hote =>
		new Promise<Date>((resolve, reject) => {
			const socket = tls.connect({ host: hote, servername: hote, port: 443, rejectUnauthorized: true, ...options })
			const abandon = setTimeout(() => {
				socket.destroy()
				reject(new Error(`aucune réponse en ${HANDSHAKE_DELAY_MS / 1000} s`))
			}, HANDSHAKE_DELAY_MS)
			socket.once('secureConnect', () => {
				clearTimeout(abandon)
				const { valid_to } = socket.getPeerCertificate()
				socket.end()
				const end = new Date(valid_to)
				if (Number.isNaN(end.getTime())) reject(new Error('date de fin illisible'))
				else resolve(end)
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
export const savedDomain = (hote: string): string => hote.split('.').slice(-2).join('.')

/**
 * What to watch for a target: the site (and `www` for the real one, which redirects to it), the Strapi API
 * while it runs, the host of the photos and the one of Umami. Nothing for a target that is not https.
 */
export function watchOf(cible: URL, api?: URL): Surveillance | undefined {
	if (cible.protocol !== 'https:') return undefined
	const hosts = [
		cible.hostname,
		...(cible.origin === SITE_ORIGIN ? [`www.${cible.hostname}`] : []),
		...(api?.protocol === 'https:' ? [api.hostname] : []),
		new URL(MEDIA_ORIGIN_DEFAULT).hostname,
		new URL(UMAMI_ORIGIN_DEFAULT).hostname,
	]
	const unique = [...new Set(hosts)]
	return { hotes: unique, domaines: [...new Set(unique.map(savedDomain))] }
}

/** RDAP servers by TLD (the IANA bootstrap lists them; the project owns .fr names). */
const SERVER_RDAP: Record<string, string> = {
	fr: 'https://rdap.nic.fr',
	com: 'https://rdap.verisign.com/com/v1',
}

/** The end date a registry's RDAP answer gives, or nothing. */
export function recordEnd(corps: string): Date | undefined {
	let data: unknown
	try {
		data = JSON.parse(corps)
	} catch {
		return undefined
	}
	if (typeof data !== 'object' || data === null || !('events' in data) || !Array.isArray(data.events)) return undefined
	for (const event of data.events as unknown[]) {
		if (typeof event !== 'object' || event === null) continue
		const { eventAction, eventDate } = event as Record<string, unknown>
		if (eventAction === 'expiration' && typeof eventDate === 'string') {
			const end = new Date(eventDate)
			if (!Number.isNaN(end.getTime())) return end
		}
	}
	return undefined
}

/** Reads the RDAP record of a domain: a GET through the guard, or nothing when no registry is known for its TLD. */
export type ReadDomain = (domaine: string) => Promise<{ statut: number; corps: string } | undefined>

export function readerRdap(transport?: Transport, horloge: Clock = REAL_CLOCK): ReadDomain {
	const readers = new Map<string, Reader>()
	return async domaine => {
		const base = SERVER_RDAP[domaine.split('.').at(-1) ?? '']
		if (!base) return undefined
		const { origin, pathname } = new URL(base)
		let reader = readers.get(origin)
		if (!reader) {
			reader = createReader({ lecture: keep(new URL(origin), transport), horloge })
			readers.set(origin, reader)
		}
		const { statut: status, corps } = await reader.lire(`${pathname.replace(/\/$/, '')}/domain/${domaine}`)
		return { statut: status, corps }
	}
}

const days = (valeur: number): string => `${Math.floor(valeur)} jour${Math.floor(valeur) > 1 ? 's' : ''}`

export interface OptionsR06 {
	surveillance: Surveillance
	certificat: ReadCertificate
	domaine: ReadDomain
	maintenant: () => Date
}

export async function probeR06({ surveillance, certificat, domaine, maintenant }: OptionsR06): Promise<Finding> {
	const verdicts: Verdict[] = []
	const findings: string[] = []

	for (const host of surveillance.hotes) {
		try {
			const remaining = remainingDays(await certificat(host), maintenant())
			const ok = remaining >= THRESHOLD_CERTIFICATE_DAYS
			verdicts.push(ok ? 'vert' : 'rouge')
			findings.push(
				`certificat de ${host} : ${remaining < 0 ? 'expiré' : `valable encore ${days(remaining)}`}${ok ? '' : ` (alerte sous ${THRESHOLD_CERTIFICATE_DAYS} jours)`}`
			)
		} catch (error) {
			verdicts.push('rouge')
			findings.push(`certificat de ${host} : refusé (${error instanceof Error ? error.message : 'erreur inconnue'})`)
		}
	}

	for (const name of surveillance.domaines) {
		try {
			const response = await domaine(name)
			if (!response) {
				verdicts.push('inconnu')
				findings.push(`domaine ${name} : pas de registre connu pour cette extension, fin non lue`)
				continue
			}
			const end = response.statut === 200 ? recordEnd(response.corps) : undefined
			if (!end) {
				verdicts.push('inconnu')
				findings.push(
					`domaine ${name} : fin d’enregistrement non lue (registre : réponse ${response.statut}${response.statut === 200 ? ', sans date de fin' : ''})`
				)
				continue
			}
			const remaining = remainingDays(end, maintenant())
			const ok = remaining >= THRESHOLD_DOMAIN_DAYS
			verdicts.push(ok ? 'vert' : 'rouge')
			findings.push(
				`domaine ${name} : ${remaining < 0 ? 'échu' : `enregistré encore ${days(remaining)}`}${ok ? '' : ` (alerte sous ${THRESHOLD_DOMAIN_DAYS} jours)`}`
			)
		} catch (error) {
			if (error instanceof ForbiddenRequest) throw error
			verdicts.push('inconnu')
			findings.push(`domaine ${name} : registre injoignable (${reasonOf(error)})`)
		}
	}
	return { verdict: worst(verdicts), constats: findings }
}

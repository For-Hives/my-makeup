/**
 * The three questions of « the bench answers », asked from this machine: the database runs a
 * query, the mail catcher greets on SMTP and its API is ready, the object storage holds its
 * bucket.
 *
 * Read-only: a probe never writes. Runs under bun only (it uses bun's PostgreSQL client).
 */

import { createConnection } from 'node:net'
import { SQL } from 'bun'
import type { ServiceInterroge, Services } from './banc'

/** One of the three services, and the question that tells whether it answers. Rejects when it does not. */
export interface Sonde extends ServiceInterroge {
	interroger: () => Promise<void>
}

const DELAI_D_UNE_SONDE_MS = 2000

const requete = async (adresse: string, methode: 'GET' | 'HEAD'): Promise<void> => {
	const reponse = await fetch(adresse, { method: methode, signal: AbortSignal.timeout(DELAI_D_UNE_SONDE_MS) })
	if (reponse.status !== 200) throw new Error(`réponse ${reponse.status}`)
}

/** Resolves when an SMTP server greets on this port (« 220 … »). */
function saluerSmtp(hote: string, port: number): Promise<void> {
	return new Promise((resolve, reject) => {
		const prise = createConnection({ host: hote, port })
		const finir = (erreur?: Error) => {
			prise.destroy()
			if (erreur) reject(erreur)
			else resolve()
		}
		prise.setTimeout(DELAI_D_UNE_SONDE_MS, () => finir(new Error('aucune réponse')))
		prise.once('error', finir)
		prise.once('data', debut =>
			finir(debut.toString().startsWith('220') ? undefined : new Error('pas un serveur de mails'))
		)
	})
}

export function sondesDuBanc(services: Services): Sonde[] {
	const { base, mails, stockage } = services
	return [
		{
			service: 'base',
			adresse: `${base.hote}:${base.port}`,
			interroger: async () => {
				const sql = new SQL({ url: base.adresse, max: 1, connectionTimeout: DELAI_D_UNE_SONDE_MS / 1000 })
				try {
					await sql`SELECT 1`
				} finally {
					await sql.close({ timeout: 0 })
				}
			},
		},
		{
			service: 'capteur de mails',
			adresse: `${mails.hote}:${mails.port}`,
			interroger: async () => {
				await saluerSmtp(mails.hote, mails.port)
				await requete(`${mails.api}/readyz`, 'GET')
			},
		},
		{
			service: 'stockage d’objets',
			adresse: new URL(stockage.adresse).host,
			interroger: () => requete(`${stockage.adresse}/${stockage.bucket}`, 'HEAD'),
		},
	]
}

/** The services that do not answer, each asked once. Empty when the bench is up. */
export async function servicesMuets(sondes: Sonde[]): Promise<Sonde[]> {
	const reponses = await Promise.allSettled(sondes.map(sonde => sonde.interroger()))
	return sondes.filter((_sonde, rang) => reponses[rang]?.status === 'rejected')
}

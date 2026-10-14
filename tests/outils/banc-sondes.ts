/**
 * The five questions of « the bench answers », asked from this machine: the database runs a
 * query, the mail catcher greets on SMTP and its API is ready, the object storage holds its
 * bucket, the fake Google presents itself under the address of this instance, the fake Umami says who it is.
 *
 * Read-only: a probe never writes. Runs under bun only (it uses bun's PostgreSQL client).
 */

import { createConnection } from 'node:net'
import { SQL } from 'bun'
import type { ServiceInterroge, Services } from './banc'

/** One of the five services, and the question that tells whether it answers. Rejects when it does not. */
export interface Sonde extends ServiceInterroge {
	interroger: () => Promise<void>
}

const DELAI_D_UNE_SONDE_MS = 2000

const requete = async (adresse: string, methode: 'GET' | 'HEAD'): Promise<Response> => {
	const reponse = await fetch(adresse, { method: methode, signal: AbortSignal.timeout(DELAI_D_UNE_SONDE_MS) })
	if (reponse.status !== 200) throw new Error(`réponse ${reponse.status}`)
	return reponse
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
	const { base, mails, stockage, google, umami } = services
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
			interroger: async () => {
				await requete(`${stockage.adresse}/${stockage.bucket}`, 'HEAD')
			},
		},
		{
			service: 'faux Google',
			adresse: new URL(google.adresse).host,
			interroger: async () => {
				// Its own word for where it is: another provider on this port, or the fake Google of
				// another instance, would sign its tokens under another address.
				const decouverte: unknown = await (
					await requete(`${google.adresse}/.well-known/openid-configuration`, 'GET')
				).json()
				if ((decouverte as { issuer?: unknown } | null)?.issuer !== google.adresse)
					throw new Error('un autre fournisseur répond à cette adresse')
			},
		},
		{
			service: 'faux Umami',
			adresse: new URL(umami.adresse).host,
			interroger: async () => {
				const sante: unknown = await (await requete(`${umami.adresse}/_sante`, 'GET')).json()
				if ((sante as { service?: unknown } | null)?.service !== 'faux-umami')
					throw new Error('un autre service répond à cette adresse')
			},
		},
	]
}

/** The services that do not answer, each asked once. Empty when the bench is up. */
export async function servicesMuets(sondes: Sonde[]): Promise<Sonde[]> {
	const reponses = await Promise.allSettled(sondes.map(sonde => sonde.interroger()))
	return sondes.filter((_sonde, rang) => reponses[rang]?.status === 'rejected')
}

/**
 * The five questions of « the bench answers », asked from this machine: the database runs a
 * query, the mail catcher greets on SMTP and its API is ready, the object storage holds its
 * bucket, the fake Google presents itself under the address of this instance, the fake Umami says who it is.
 *
 * Read-only: a probe never writes. Runs under bun only (it uses bun's PostgreSQL client).
 */

import { createConnection } from 'node:net'
import { SQL } from 'bun'
import type { ServiceQueried, Services } from './bench'

/** One of the six services, and the question that tells whether it answers. Rejects when it does not. */
export interface Probe extends ServiceQueried {
	interroger: () => Promise<void>
}

const PROBE_DELAY_MS = 2000

const request = async (adresse: string, methode: 'GET' | 'HEAD'): Promise<Response> => {
	const response = await fetch(adresse, { method: methode, signal: AbortSignal.timeout(PROBE_DELAY_MS) })
	if (response.status !== 200) throw new Error(`réponse ${response.status}`)
	return response
}

/** Resolves when an SMTP server greets on this port (« 220 … »). */
function greetSmtp(hote: string, port: number): Promise<void> {
	return new Promise((resolve, reject) => {
		const taken = createConnection({ host: hote, port })
		const finish = (erreur?: Error) => {
			taken.destroy()
			if (erreur) reject(erreur)
			else resolve()
		}
		taken.setTimeout(PROBE_DELAY_MS, () => finish(new Error('aucune réponse')))
		taken.once('error', finish)
		taken.once('data', debut =>
			finish(debut.toString().startsWith('220') ? undefined : new Error('pas un serveur de mails'))
		)
	})
}

export function benchProbes(services: Services): Probe[] {
	const { base, mails, stockage: storage, google, umami, communes: cities } = services
	return [
		{
			service: 'base',
			adresse: `${base.hote}:${base.port}`,
			interroger: async () => {
				const sql = new SQL({ url: base.adresse, max: 1, connectionTimeout: PROBE_DELAY_MS / 1000 })
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
				await greetSmtp(mails.hote, mails.port)
				await request(`${mails.api}/readyz`, 'GET')
			},
		},
		{
			service: 'stockage d’objets',
			adresse: new URL(storage.adresse).host,
			interroger: async () => {
				await request(`${storage.adresse}/${storage.bucket}`, 'HEAD')
			},
		},
		{
			service: 'faux Google',
			adresse: new URL(google.adresse).host,
			interroger: async () => {
				// Its own word for where it is: another provider on this port, or the fake Google of
				// another instance, would sign its tokens under another address.
				const discovery: unknown = await (
					await request(`${google.adresse}/.well-known/openid-configuration`, 'GET')
				).json()
				if ((discovery as { issuer?: unknown } | null)?.issuer !== google.adresse)
					throw new Error('un autre fournisseur répond à cette adresse')
			},
		},
		{
			service: 'faux Umami',
			adresse: new URL(umami.adresse).host,
			interroger: async () => {
				const health: unknown = await (await request(`${umami.adresse}/_sante`, 'GET')).json()
				if ((health as { service?: unknown } | null)?.service !== 'fake-umami')
					throw new Error('un autre service répond à cette adresse')
			},
		},
		{
			service: 'fausse liste des communes',
			adresse: new URL(cities.adresse).host,
			interroger: async () => {
				const health: unknown = await (await request(`${cities.adresse}/_sante`, 'GET')).json()
				if ((health as { service?: unknown } | null)?.service !== 'fake-cities')
					throw new Error('un autre service répond à cette adresse')
			},
		},
	]
}

/** The services that do not answer, each asked once. Empty when the bench is up. */
export async function serviceSilent(sondes: Probe[]): Promise<Probe[]> {
	const responses = await Promise.allSettled(sondes.map(sonde => sonde.interroger()))
	return sondes.filter((_sonde, rang) => responses[rang]?.status === 'rejected')
}

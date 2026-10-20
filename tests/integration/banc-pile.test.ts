import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { SQL } from 'bun'
import { z } from 'zod'
import { benchEnvironment, benchServices, FILE_COMPOSE } from '../support/bench'
import { benchProbes, serviceSilent } from '../support/bench-probes'

/**
 * The bench as it runs: what `bun run bench:up` started is asked from this machine, through the
 * environment the integration command gave to this process.
 */
const environnement = benchEnvironment()
const services = benchServices(environnement)

/** The version each service must run: the tag its image is pinned at in compose.test.yml. */
const versionEpinglee = (image: string): string => {
	const version = new RegExp(`image: ${image}:v?([0-9.]+)`).exec(readFileSync(FILE_COMPOSE, 'utf8'))?.[1]
	if (!version) throw new Error(`image ${image} absente de compose.test.yml`)
	return version
}

describe('Le banc démarré : la base, le capteur de mails, le stockage d’objets et le faux Google répondent', () => {
	test('ce lancement tourne sous l’environnement de son instance', () => {
		for (const [nom, valeur] of Object.entries(environnement))
			expect({ nom, valeur: process.env[nom] }).toEqual({ nom, valeur })
	})

	test('les quatre services répondent', async () => {
		const muets = await serviceSilent(benchProbes(services))

		expect(muets.map(({ service }) => service)).toEqual([])
	})

	test('la base est le PostgreSQL épinglé, jetable : aucune écriture n’attend le disque', async () => {
		const sql = new SQL({ url: services.base.adresse, max: 1 })
		try {
			const [reglages] = await sql`
				SELECT current_setting('server_version') AS version, current_setting('fsync') AS fsync, current_database() AS base
			`
			expect(reglages).toEqual({ version: versionEpinglee('postgres'), fsync: 'off', base: services.base.nom })
		} finally {
			await sql.close()
		}
	})

	test('le capteur de mails est le Mailpit épinglé, et son API se lit', async () => {
		const reponse = await fetch(`${services.mails.api}/api/v1/info`)
		const info = z.object({ Version: z.string(), Messages: z.number() }).parse(await reponse.json())

		expect(reponse.status).toBe(200)
		expect(info.Version).toBe(`v${versionEpinglee('axllent/mailpit')}`)
	})

	test('le stockage d’objets a son espace, créé au démarrage, et aucun autre', async () => {
		const reponse = await fetch(`${services.stockage.adresse}/`)
		const espaces = [...(await reponse.text()).matchAll(/<Name>([^<]+)<\/Name>/g)].map(([, nom]) => nom)

		expect(reponse.status).toBe(200)
		expect(espaces).toEqual([services.stockage.bucket])
	})
})

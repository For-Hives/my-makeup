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
const environment = benchEnvironment()
const services = benchServices(environment)

/** The version each service must run: the tag its image is pinned at in compose.test.yml. */
const pinnedVersion = (image: string): string => {
	const version = new RegExp(`image: ${image}:v?([0-9.]+)`).exec(readFileSync(FILE_COMPOSE, 'utf8'))?.[1]
	if (!version) throw new Error(`image ${image} absente de compose.test.yml`)
	return version
}

describe('Le banc démarré : la base, le capteur de mails, le stockage d’objets et le faux Google répondent', () => {
	test('ce lancement tourne sous l’environnement de son instance', () => {
		for (const [name, value] of Object.entries(environment))
			expect({ nom: name, valeur: process.env[name] }).toEqual({ nom: name, valeur: value })
	})

	test('les quatre services répondent', async () => {
		const silent = await serviceSilent(benchProbes(services))

		expect(silent.map(({ service }) => service)).toEqual([])
	})

	test('la base est le PostgreSQL épinglé, jetable : aucune écriture n’attend le disque', async () => {
		const sql = new SQL({ url: services.base.adresse, max: 1 })
		try {
			const [settings] = await sql`
				SELECT current_setting('server_version') AS version, current_setting('fsync') AS fsync, current_database() AS base
			`
			expect(settings).toEqual({ version: pinnedVersion('postgres'), fsync: 'off', base: services.base.nom })
		} finally {
			await sql.close()
		}
	})

	test('le capteur de mails est le Mailpit épinglé, et son API se lit', async () => {
		const response = await fetch(`${services.mails.api}/api/v1/info`)
		const info = z.object({ Version: z.string(), Messages: z.number() }).parse(await response.json())

		expect(response.status).toBe(200)
		expect(info.Version).toBe(`v${pinnedVersion('axllent/mailpit')}`)
	})

	test('le stockage d’objets a son espace, créé au démarrage, et aucun autre', async () => {
		const response = await fetch(`${services.stockage.adresse}/`)
		const dashboards = [...(await response.text()).matchAll(/<Name>([^<]+)<\/Name>/g)].map(([, name]) => name)

		expect(response.status).toBe(200)
		expect(dashboards).toEqual([services.stockage.bucket])
	})
})

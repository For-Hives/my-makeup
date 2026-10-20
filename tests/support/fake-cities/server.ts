/**
 * Entry point of the fake list of the communes: what the container of the bench runs
 * (compose.test.yml, service « fake-cities »). The list itself is ./provider.ts.
 *
 *   FAKE_CITIES_LISTEN   the interface it listens on (default 127.0.0.1; 0.0.0.0 inside the
 *                          container, whose port is published on the loopback interface only).
 *   FAKE_CITIES_PORT     the port it listens on (default 2050; 0 for any free port).
 *
 * It prints nothing.
 */

import { createFakeCities } from './provider'

const PORT_BY_DEFAULT = 2050

const port = Number(process.env.FAKE_CITIES_PORT || PORT_BY_DEFAULT)
if (!Number.isInteger(port) || port < 0 || port > 65_535) {
	console.error('Fausse liste des communes : FAKE_CITIES_PORT doit être un numéro de port.')
	process.exit(2)
}

const provider = createFakeCities()
const server = Bun.serve({
	hostname: process.env.FAKE_CITIES_LISTEN || '127.0.0.1',
	port,
	fetch: requete => provider.repondre(requete),
})

for (const signal of ['SIGINT', 'SIGTERM'] as const)
	process.on(signal, () => {
		void server.stop(true)
		process.exit(0)
	})

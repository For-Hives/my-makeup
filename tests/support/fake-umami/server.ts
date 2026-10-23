/**
 * Entry point of the fake Umami: what the container of the bench runs (compose.test.yml, service
 * « fake-umami »). The instance itself is ./provider.ts.
 *
 *   FAKE_UMAMI_LISTEN   the interface it listens on (default 127.0.0.1; 0.0.0.0 inside the container,
 *                       whose port is published on the loopback interface only).
 *   FAKE_UMAMI_PORT     the port it listens on (default 4200; 0 for any free port).
 *
 * It prints nothing: what it receives is read through GET /_recus.
 */

import { createFakeUmami } from './provider'

const PORT_BY_DEFAULT = 4200

const port = Number(process.env.FAKE_UMAMI_PORT || PORT_BY_DEFAULT)
if (!Number.isInteger(port) || port < 0 || port > 65_535) {
	console.error('Faux Umami : FAKE_UMAMI_PORT doit être un numéro de port.')
	process.exit(2)
}

const provider = createFakeUmami()
const server = Bun.serve({
	hostname: process.env.FAKE_UMAMI_LISTEN || '127.0.0.1',
	port,
	fetch: requete => provider.repondre(requete),
})

for (const signal of ['SIGINT', 'SIGTERM'] as const)
	process.on(signal, () => {
		void server.stop(true)
		process.exit(0)
	})

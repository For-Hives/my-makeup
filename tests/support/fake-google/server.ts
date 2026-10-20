/**
 * Entry point of the fake Google: what the container of the bench runs (compose.test.yml,
 * service « fake-google »). The provider itself is ./provider.ts.
 *
 * It reads the three variables the application reads, so that both sides are set with the same
 * words, and two of its own:
 *
 *   GOOGLE_OIDC_ISSUER     the address it is reached at from this machine: the issuer of its tokens.
 *                          Left out: http://127.0.0.1 on the port it listens on.
 *   GOOGLE_CLIENT_ID       the only client it accepts, and its secret. Both must say « factice »:
 *   GOOGLE_CLIENT_SECRET   the provider refuses to start with anything that could be a real one.
 *   FAKE_GOOGLE_LISTEN     the interface it listens on (default 127.0.0.1; 0.0.0.0 inside the container,
 *                          whose port is published on the loopback interface only).
 *   FAKE_GOOGLE_PORT       the port it listens on (default 7080; 0 for any free port).
 *
 * It prints one line when it is ready, and nothing afterwards: no token, no identity.
 */

import { createFakeGoogle, type FakeGoogle } from './provider'

const PORT_BY_DEFAULT = 7080

/** Stops with one line that names the variable, never a value. */
function stop(message: string): never {
	console.error(`Faux Google : ${message}`)
	process.exit(2)
}

const demand = (nom: string): string => process.env[nom] || stop(`${nom} manque.`)

const port = Number(process.env.FAKE_GOOGLE_PORT || PORT_BY_DEFAULT)
if (!Number.isInteger(port) || port < 0 || port > 65_535) stop('FAKE_GOOGLE_PORT doit être un numéro de port.')
const clientId = demand('GOOGLE_CLIENT_ID')
const secret = demand('GOOGLE_CLIENT_SECRET')

let provider: FakeGoogle | undefined

// The port is opened first: when it is drawn at random, the address of the provider depends on it.
const server = Bun.serve({
	hostname: process.env.FAKE_GOOGLE_LISTEN || '127.0.0.1',
	port,
	fetch: requete => provider?.repondre(requete) ?? new Response('Faux Google : démarrage en cours.\n', { status: 503 }),
})

for (const signal of ['SIGINT', 'SIGTERM'] as const)
	process.on(signal, () => {
		void server.stop(true)
		process.exit(0)
	})

try {
	provider = await createFakeGoogle({
		emetteur: process.env.GOOGLE_OIDC_ISSUER || `http://127.0.0.1:${server.port}`,
		clientId,
		secret,
	})
} catch (error) {
	stop(error instanceof Error ? error.message.replace(/^Faux Google : /, '') : 'démarrage impossible.')
}

console.log(`Faux Google prêt : ${provider.emetteur}`)

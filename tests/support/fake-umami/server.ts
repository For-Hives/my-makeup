/**
 * Entry point of the fake Umami: what the container of the bench runs (compose.test.yml, service
 * « faux-umami »). The instance itself is ./fournisseur.ts.
 *
 *   FAUX_UMAMI_ECOUTE   the interface it listens on (default 127.0.0.1; 0.0.0.0 inside the container,
 *                       whose port is published on the loopback interface only).
 *   FAUX_UMAMI_PORT     the port it listens on (default 4200; 0 for any free port).
 *
 * It prints nothing: what it receives is read through GET /_recus.
 */

import { creerFauxUmami } from './provider'

const PORT_PAR_DEFAUT = 4200

const port = Number(process.env.FAUX_UMAMI_PORT || PORT_PAR_DEFAUT)
if (!Number.isInteger(port) || port < 0 || port > 65_535) {
	console.error('Faux Umami : FAUX_UMAMI_PORT doit être un numéro de port.')
	process.exit(2)
}

const fournisseur = creerFauxUmami()
const serveur = Bun.serve({
	hostname: process.env.FAUX_UMAMI_ECOUTE || '127.0.0.1',
	port,
	fetch: requete => fournisseur.repondre(requete),
})

for (const signal of ['SIGINT', 'SIGTERM'] as const)
	process.on(signal, () => {
		void serveur.stop(true)
		process.exit(0)
	})

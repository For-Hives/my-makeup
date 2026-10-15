/**
 * Entry point of the fake list of the communes: what the container of the bench runs
 * (compose.test.yml, service « faux-communes »). The list itself is ./fournisseur.ts.
 *
 *   FAUX_COMMUNES_ECOUTE   the interface it listens on (default 127.0.0.1; 0.0.0.0 inside the
 *                          container, whose port is published on the loopback interface only).
 *   FAUX_COMMUNES_PORT     the port it listens on (default 2050; 0 for any free port).
 *
 * It prints nothing.
 */

import { creerFaussesCommunes } from './fournisseur'

const PORT_PAR_DEFAUT = 2050

const port = Number(process.env.FAUX_COMMUNES_PORT || PORT_PAR_DEFAUT)
if (!Number.isInteger(port) || port < 0 || port > 65_535) {
	console.error('Fausse liste des communes : FAUX_COMMUNES_PORT doit être un numéro de port.')
	process.exit(2)
}

const fournisseur = creerFaussesCommunes()
const serveur = Bun.serve({
	hostname: process.env.FAUX_COMMUNES_ECOUTE || '127.0.0.1',
	port,
	fetch: requete => fournisseur.repondre(requete),
})

for (const signal of ['SIGINT', 'SIGTERM'] as const)
	process.on(signal, () => {
		void serveur.stop(true)
		process.exit(0)
	})

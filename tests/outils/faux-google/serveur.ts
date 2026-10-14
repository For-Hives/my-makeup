/**
 * Entry point of the fake Google: what the container of the bench runs (compose.test.yml,
 * service « faux-google »). The provider itself is ./fournisseur.ts.
 *
 * It reads the three variables the application reads, so that both sides are set with the same
 * words, and two of its own:
 *
 *   GOOGLE_OIDC_ISSUER     the address it is reached at from this machine: the issuer of its tokens.
 *                          Left out: http://127.0.0.1 on the port it listens on.
 *   GOOGLE_CLIENT_ID       the only client it accepts, and its secret. Both must say « factice »:
 *   GOOGLE_CLIENT_SECRET   the provider refuses to start with anything that could be a real one.
 *   FAUX_GOOGLE_ECOUTE     the interface it listens on (default 127.0.0.1; 0.0.0.0 inside the container,
 *                          whose port is published on the loopback interface only).
 *   FAUX_GOOGLE_PORT       the port it listens on (default 7080; 0 for any free port).
 *
 * It prints one line when it is ready, and nothing afterwards: no token, no identity.
 */

import { creerFauxGoogle, type FauxGoogle } from './fournisseur'

const PORT_PAR_DEFAUT = 7080

/** Stops with one line that names the variable, never a value. */
function arreter(message: string): never {
	console.error(`Faux Google : ${message}`)
	process.exit(2)
}

const exiger = (nom: string): string => process.env[nom] || arreter(`${nom} manque.`)

const port = Number(process.env.FAUX_GOOGLE_PORT || PORT_PAR_DEFAUT)
if (!Number.isInteger(port) || port < 0 || port > 65_535) arreter('FAUX_GOOGLE_PORT doit être un numéro de port.')
const clientId = exiger('GOOGLE_CLIENT_ID')
const secret = exiger('GOOGLE_CLIENT_SECRET')

let fournisseur: FauxGoogle | undefined

// The port is opened first: when it is drawn at random, the address of the provider depends on it.
const serveur = Bun.serve({
	hostname: process.env.FAUX_GOOGLE_ECOUTE || '127.0.0.1',
	port,
	fetch: requete =>
		fournisseur?.repondre(requete) ?? new Response('Faux Google : démarrage en cours.\n', { status: 503 }),
})

for (const signal of ['SIGINT', 'SIGTERM'] as const)
	process.on(signal, () => {
		void serveur.stop(true)
		process.exit(0)
	})

try {
	fournisseur = await creerFauxGoogle({
		emetteur: process.env.GOOGLE_OIDC_ISSUER || `http://127.0.0.1:${serveur.port}`,
		clientId,
		secret,
	})
} catch (erreur) {
	arreter(erreur instanceof Error ? erreur.message.replace(/^Faux Google : /, '') : 'démarrage impossible.')
}

console.log(`Faux Google prêt : ${fournisseur.emetteur}`)

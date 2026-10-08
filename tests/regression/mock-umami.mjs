// Fake Umami for the regression suite (MES-10): the build of the test points
// UMAMI_ORIGIN to it, so /u/script.js and /u/api/send of the app are
// proxied here, never to the real instance.
// - GET /script.js: the real Umami 3.2.0 tracker (umami-tracker-3.2.0.js);
// - POST /api/send: answers like Umami ({ cache }) and keeps the request;
// - /__umami/etat (the requests received, with the headers that matter) and
//   /__umami/reset drive it from the tests.
import http from 'node:http'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const TRACKER = readFileSync(
	path.join(
		path.dirname(fileURLToPath(import.meta.url)),
		'umami-tracker-3.2.0.js'
	)
)

// headers the tests look at: what must never arrive (cookie, referer, an IP
// or a country sent by the browser) and what Umami needs (IP, user agent)
const ENTETES_SUIVIES = [
	'cookie',
	'authorization',
	'referer',
	'true-client-ip',
	'x-forwarded-for',
	'x-real-ip',
	'cf-ipcountry',
	'user-agent',
	'content-type',
]

export function demarrerFauxUmami(port = 4113) {
	const journal = []

	const serveur = http.createServer(async (req, res) => {
		const url = new URL(req.url, `http://127.0.0.1:${port}`)
		const json = (status, corps) => {
			res.writeHead(status, { 'content-type': 'application/json' })
			res.end(JSON.stringify(corps))
		}

		if (url.pathname === '/__umami/reset') {
			journal.length = 0
			return json(200, { ok: true })
		}
		if (url.pathname === '/__umami/etat') return json(200, { journal })

		const entetes = {}
		for (const nom of ENTETES_SUIVIES)
			if (req.headers[nom] !== undefined) entetes[nom] = req.headers[nom]
		const requete = { methode: req.method, chemin: url.pathname, entetes }

		if (req.method === 'GET' && url.pathname === '/script.js') {
			journal.push(requete)
			res.writeHead(200, {
				'content-type': 'application/javascript; charset=UTF-8',
				'cache-control': 'no-store',
			})
			return res.end(TRACKER)
		}

		if (req.method === 'POST' && url.pathname === '/api/send') {
			let brut = ''
			for await (const morceau of req) brut += morceau
			try {
				requete.corps = JSON.parse(brut)
			} catch {
				requete.corps = null
			}
			journal.push(requete)
			if (!requete.corps?.payload?.website)
				return json(400, { error: 'Bad request' })
			return json(200, { cache: 'jeton-cache-factice' })
		}

		journal.push(requete)
		json(404, { error: 'Not found' })
	})

	return new Promise(resolve =>
		serveur.listen(port, '127.0.0.1', () => resolve(serveur))
	)
}

// `node tests/regression/mock-umami.mjs [port]`: the fake Umami alone
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	const port = Number(process.argv[2] ?? 4113)
	await demarrerFauxUmami(port)
	console.log(`faux Umami sur http://127.0.0.1:${port}`)
}

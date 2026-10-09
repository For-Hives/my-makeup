// Fake Umami for the regression suite (MES-10): the build of the test points
// UMAMI_ORIGIN to it, so /u/script.js and /u/api/send of the app are
// proxied here, never to the real instance.
// - GET /script.js: the real Umami 3.2.0 tracker (umami-tracker-3.2.0.js);
// - POST /api/send: answers like Umami ({ cache }) and keeps the request;
// - /__umami/etat (the requests received, with the headers that matter),
//   /__umami/reset, /__umami/retenir (a slow or silent Umami: /script.js is
//   received but not answered) and /__umami/liberer (answers the held
//   requests) drive it from the tests.

import { readFileSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const TRACKER = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'umami-tracker-3.2.0.js'))

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

function servirScript(res) {
	res.writeHead(200, { 'content-type': 'application/javascript; charset=UTF-8', 'cache-control': 'no-store' })
	res.end(TRACKER)
}
function jsonUmami(res, status, corps) {
	res.writeHead(status, { 'content-type': 'application/json' })
	res.end(JSON.stringify(corps))
}
function liberer(etat) {
	etat.retenir = false
	for (const res of etat.retenues.splice(0)) {
		if (!res.destroyed) servirScript(res)
	}
}
function controlerUmami(chemin, etat, res) {
	switch (chemin) {
		case '/__umami/reset':
			liberer(etat)
			etat.journal.length = 0
			break
		case '/__umami/retenir':
			etat.retenir = true
			break
		case '/__umami/liberer':
			liberer(etat)
			break
		case '/__umami/etat':
			jsonUmami(res, 200, { journal: etat.journal })
			return true
		default:
			return false
	}
	jsonUmami(res, 200, { ok: true })
	return true
}
async function recevoirEvenement(req, res, requete, journal) {
	let brut = ''
	for await (const morceau of req) brut += morceau
	try {
		requete.corps = JSON.parse(brut)
	} catch {
		requete.corps = null
	}
	journal.push(requete)
	if (!requete.corps?.payload?.website) return jsonUmami(res, 400, { error: 'Bad request' })
	return jsonUmami(res, 200, { cache: 'jeton-cache-factice' })
}
export function demarrerFauxUmami(port = 4113) {
	const etat = { journal: [], retenir: false, retenues: [] }
	const serveur = http.createServer(async (req, res) => {
		const url = new URL(req.url, `http://127.0.0.1:${port}`)
		if (controlerUmami(url.pathname, etat, res)) return
		const entetes = Object.fromEntries(
			ENTETES_SUIVIES.filter(nom => req.headers[nom] !== undefined).map(nom => [nom, req.headers[nom]])
		)
		const requete = { methode: req.method, chemin: url.pathname, entetes }
		if (req.method === 'GET' && url.pathname === '/script.js') {
			etat.journal.push(requete)
			if (etat.retenir) return etat.retenues.push(res)
			return servirScript(res)
		}
		if (req.method === 'POST' && url.pathname === '/api/send')
			return await recevoirEvenement(req, res, requete, etat.journal)
		etat.journal.push(requete)
		jsonUmami(res, 404, { error: 'Not found' })
	})
	return new Promise(resolve => serveur.listen(port, '127.0.0.1', () => resolve(serveur)))
}

// `node tests/regression/mock-umami.mjs [port]`: the fake Umami alone
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	const port = Number(process.argv[2] ?? 4113)
	// biome-ignore lint/suspicious/noConsole: The standalone test runner reports its server address and build progress.
	console.log(`faux Umami sur http://127.0.0.1:${port}`)
	await demarrerFauxUmami(port)
}

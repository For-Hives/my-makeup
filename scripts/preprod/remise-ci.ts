/**
 * The reset of the pre-production to its seeded state, for the manual run of the CI (ticket 174,
 * docs/preprod.md, « Les contrôles par la CI »):
 *
 *   COOLIFY_URL=… COOLIFY_TOKEN=… REMISE_IDENTIFIANT=<run id> bun run preprod:remise-ci
 *
 * The pre-production resets itself when it starts with a new token in `PREPROD_REMISE_A_ZERO` (it
 * empties its database, plays its migrations, loads the fictional set). This script gives it that
 * token through the API of Coolify, restarts it, and waits until its log says the reset was done.
 *
 * What it does, in this order, and nothing else:
 *   1. refuses anything but the pre-production: the application is the one of the constant below,
 *      and Coolify must say that its address is https://preprod.my-makeup.fr (U86: the site, its
 *      `www` and its `api` are never a target);
 *   2. writes ONE variable, `PREPROD_REMISE_A_ZERO`, with a token made from the run (it is no
 *      secret). It never reads the variables of the application, and never touches the database
 *      variables: the application itself refuses to reset any database but `mymakeup_preprod`
 *      (src/preprod/remise.ts) and refuses the variable outside the pre-production (src/lib/env.ts);
 *   3. restarts the application;
 *   4. pokes `/api/health` (the first request starts Payload, which resets) and reads the log of the
 *      application until it says « Remise à zéro « <token> » faite ». « non faite », « interrompue »
 *      or « déjà faite » stop with a failure.
 *
 * The token of Coolify and the protected access travel in headers and are never printed. The log is
 * read for one line, which holds the token of the run and nothing else. No dependency, `fetch` only.
 */

/** The pre-production in Coolify (docs/preprod.md): the only application this script may restart. */
export const APPLICATION_PREPROD = 'yyo8srksuun0kqeclpb4cug9'

/** Its public address, which Coolify must report for that application. */
export const ADRESSE_DE_LA_PREPROD = 'https://preprod.my-makeup.fr'

/** The variable of the application that starts a reset (README, « Variables d'environnement »). */
export const VARIABLE_DE_REMISE = 'PREPROD_REMISE_A_ZERO'

/** The shape the application accepts for the token (src/lib/env.ts, JETON_DE_REMISE_A_ZERO). */
export const FORME_DU_JETON = /^[a-z0-9][a-z0-9-]{7,63}$/

export const ATTENTE_MAX_MS = 15 * 60_000
export const INTERVALLE_MS = 10_000
const DELAI_DE_REPONSE_MS = 20_000

export type Variables = Partial<
	Record<
		| 'COOLIFY_TOKEN'
		| 'COOLIFY_URL'
		| 'PREPROD_BASIC_AUTH_PASSWORD'
		| 'PREPROD_BASIC_AUTH_USER'
		| 'REMISE_IDENTIFIANT'
		| 'REMISE_TENTATIVE',
		string
	>
>

/** The reset cannot run as it is set: the message names the variable, never its value. */
export class RemiseRefusee extends Error {
	override readonly name = 'RemiseRefusee'
}

export interface Reglages {
	coolify: string
	jeton: string
	/** The `Authorization` header of the protected access, to poke the pre-production. */
	acces?: string
	jetonDeRemise: string
}

export type Lire = (adresse: string, init: RequestInit) => Promise<Response>

export interface Outils {
	lire: Lire
	journal: (ligne: string) => void
	attendre: (ms: number) => Promise<void>
	maintenant: () => number
	attenteMaxMs?: number
	intervalleMs?: number
}

/** The token of a run: `ci-<run>-<attempt>`, new for each run and each re-run. */
export function jetonDeRemise(identifiant: string | undefined, tentative: string | undefined): string {
	if (!identifiant || !/^\d{1,20}$/.test(identifiant))
		throw new RemiseRefusee('REMISE_IDENTIFIANT manque ou n’est pas un nombre : en CI, c’est le numéro du lancement.')
	const jeton = `ci-${identifiant}-${/^\d{1,3}$/.test(tentative ?? '') ? tentative : '1'}`
	if (!FORME_DU_JETON.test(jeton))
		throw new RemiseRefusee('Le jeton de remise à zéro n’a pas la forme que la préprod accepte.')
	return jeton
}

/** Reads the variables, or `RemiseRefusee` with what to fix. */
export function lireLesReglages(variables: Variables): Reglages {
	const url = variables.COOLIFY_URL?.trim() ?? ''
	const jeton = variables.COOLIFY_TOKEN ?? ''
	if (url === '' || jeton === '')
		throw new RemiseRefusee(
			'COOLIFY_URL et COOLIFY_TOKEN sont obligatoires : en CI, ce sont deux secrets du dépôt (docs/preprod.md, « Les contrôles par la CI »).'
		)
	const lue = URL.canParse(url) ? new URL(url) : undefined
	if (!lue || lue.protocol !== 'https:' || lue.username || lue.password || lue.search || lue.hash)
		throw new RemiseRefusee('COOLIFY_URL doit être une adresse https, sans identifiant ni paramètre.')
	const utilisateur = variables.PREPROD_BASIC_AUTH_USER ?? ''
	const motDePasse = variables.PREPROD_BASIC_AUTH_PASSWORD ?? ''
	return {
		coolify: `${lue.origin}${lue.pathname.replace(/\/+$/, '')}`,
		jeton,
		jetonDeRemise: jetonDeRemise(variables.REMISE_IDENTIFIANT, variables.REMISE_TENTATIVE),
		...(utilisateur !== '' && motDePasse !== '' && { acces: `Basic ${btoa(`${utilisateur}:${motDePasse}`)}` }),
	}
}

/** What went wrong with a request: its code, never its text. */
function raison(erreur: unknown): string {
	const cause = (erreur as { cause?: { code?: unknown } } | null)?.cause
	const code = typeof cause?.code === 'string' ? cause.code : (erreur as { name?: unknown } | null)?.name
	return typeof code === 'string' && /^[\w-]{1,40}$/.test(code) ? code : 'erreur'
}

const api = (reglages: Reglages, lire: Lire, methode: string, chemin: string, corps?: unknown): Promise<Response> =>
	lire(`${reglages.coolify}/api/v1${chemin}`, {
		method: methode,
		headers: {
			Authorization: `Bearer ${reglages.jeton}`,
			Accept: 'application/json',
			...(corps === undefined ? {} : { 'Content-Type': 'application/json' }),
		},
		...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
		redirect: 'manual',
		signal: AbortSignal.timeout(DELAI_DE_REPONSE_MS),
	})

/** The host of an address, lower case, or nothing. */
const hoteDe = (adresse: unknown): string | undefined =>
	typeof adresse === 'string' && URL.canParse(adresse.split(',')[0]?.trim() ?? '')
		? new URL(adresse.split(',')[0]?.trim() ?? '').hostname.toLowerCase()
		: undefined

/** Step 1: Coolify says this application is the pre-production, and only it. */
export async function verifierLaCible(reglages: Reglages, lire: Lire): Promise<void> {
	const reponse = await api(reglages, lire, 'GET', `/applications/${APPLICATION_PREPROD}`)
	if (reponse.status === 401 || reponse.status === 403)
		throw new RemiseRefusee(
			'Coolify refuse le jeton (401 ou 403) : COOLIFY_TOKEN n’est pas valable ou n’a pas le droit d’écrire.'
		)
	if (reponse.status !== 200)
		throw new RemiseRefusee(`Coolify répond ${reponse.status} pour l’application de la préprod.`)
	const application = (await reponse.json()) as { fqdn?: unknown }
	const adresses = typeof application.fqdn === 'string' ? application.fqdn.split(',').map(a => a.trim()) : []
	const hotes = adresses.map(hoteDe)
	if (hotes.length === 0 || hotes.some(hote => hote !== new URL(ADRESSE_DE_LA_PREPROD).hostname))
		throw new RemiseRefusee(
			`Remise refusée : l’application ${APPLICATION_PREPROD} n’est pas seulement ${ADRESSE_DE_LA_PREPROD} dans Coolify. Seule la préprod se remet à zéro, jamais le site.`
		)
}

/** Step 2: the one variable. An update first, a creation when the variable does not exist. */
export async function poserLeJeton(reglages: Reglages, lire: Lire): Promise<void> {
	const corps = { key: VARIABLE_DE_REMISE, value: reglages.jetonDeRemise, is_preview: false }
	let reponse = await api(reglages, lire, 'PATCH', `/applications/${APPLICATION_PREPROD}/envs`, corps)
	if (reponse.status === 404)
		reponse = await api(reglages, lire, 'POST', `/applications/${APPLICATION_PREPROD}/envs`, corps)
	if (reponse.status < 200 || reponse.status >= 300)
		throw new RemiseRefusee(`Coolify n’a pas pris la variable ${VARIABLE_DE_REMISE} (réponse ${reponse.status}).`)
}

/** Step 3. */
export async function redemarrer(reglages: Reglages, lire: Lire): Promise<void> {
	const reponse = await api(reglages, lire, 'POST', `/applications/${APPLICATION_PREPROD}/restart`)
	if (reponse.status < 200 || reponse.status >= 300)
		throw new RemiseRefusee(`Coolify n’a pas redémarré la préprod (réponse ${reponse.status}).`)
}

/** What the log says about the reset of this token: done, not done, already done, or nothing yet. */
export function etatDeLaRemise(
	journalDeLApplication: string,
	jeton: string
): 'faite' | 'refusee' | 'deja-faite' | 'inconnu' {
	const lignes = journalDeLApplication.split('\n').filter(ligne => ligne.includes(`« ${jeton} »`))
	if (lignes.some(ligne => /non faite|interrompue/.test(ligne))) return 'refusee'
	if (lignes.some(ligne => /déjà faite/.test(ligne))) return 'deja-faite'
	if (lignes.some(ligne => /faite : /.test(ligne))) return 'faite'
	return 'inconnu'
}

/** The text of a log answer of Coolify: a string, or an object holding it. */
async function texteDuJournal(reponse: Response): Promise<string> {
	const texte = await reponse.text()
	try {
		const json = JSON.parse(texte) as unknown
		if (typeof json === 'string') return json
		const logs = (json as { logs?: unknown } | null)?.logs
		return typeof logs === 'string' ? logs : texte
	} catch {
		return texte
	}
}

/** Step 4. */
export async function attendreLaRemise(reglages: Reglages, outils: Outils): Promise<void> {
	const { lire, journal, attendre, maintenant, attenteMaxMs = ATTENTE_MAX_MS, intervalleMs = INTERVALLE_MS } = outils
	const fin = maintenant() + attenteMaxMs
	let derniere = ''
	for (;;) {
		let vue: string
		try {
			// The first request after a start starts Payload, which resets. The access is the protected one.
			if (reglages.acces)
				await lire(`${ADRESSE_DE_LA_PREPROD}/api/health`, {
					headers: { Authorization: reglages.acces },
					redirect: 'manual',
					signal: AbortSignal.timeout(DELAI_DE_REPONSE_MS),
				}).catch(() => undefined)
			const reponse = await api(reglages, lire, 'GET', `/applications/${APPLICATION_PREPROD}/logs?lines=2000`)
			if (reponse.status !== 200) vue = `le journal répond ${reponse.status}`
			else {
				const etat = etatDeLaRemise(await texteDuJournal(reponse), reglages.jetonDeRemise)
				if (etat === 'faite') {
					journal(`Remise à zéro « ${reglages.jetonDeRemise} » faite : la préprod est revenue à son état semé.`)
					return
				}
				if (etat === 'refusee')
					throw new RemiseRefusee(
						`La préprod a refusé la remise « ${reglages.jetonDeRemise} » (base gardée) : lis son journal dans Coolify.`
					)
				if (etat === 'deja-faite')
					throw new RemiseRefusee(
						`La remise « ${reglages.jetonDeRemise} » avait déjà eu lieu : rien n’a été effacé ce coup-ci. Relance le contrôle.`
					)
				vue = 'le journal ne dit pas encore la remise'
			}
		} catch (erreur) {
			if (erreur instanceof RemiseRefusee) throw erreur
			vue = `Coolify ne répond pas (${raison(erreur)})`
		}
		if (vue !== derniere) {
			journal(`${vue} ; nouvel essai toutes les ${intervalleMs / 1000} s.`)
			derniere = vue
		}
		if (maintenant() + intervalleMs > fin)
			throw new RemiseRefusee(
				`La remise « ${reglages.jetonDeRemise} » n’est pas faite après ${Math.round(attenteMaxMs / 60_000)} minutes (${vue}) : voir le journal de la préprod dans Coolify.`
			)
		await attendre(intervalleMs)
	}
}

/** The whole reset. Exit code 0 when the pre-production is back to its seeded state, 1 otherwise. */
export async function remettreLaPreprod(variables: Variables, outils: Outils): Promise<number> {
	try {
		const reglages = lireLesReglages(variables)
		outils.journal(`Remise à zéro de la préprod, jeton « ${reglages.jetonDeRemise} ».`)
		await verifierLaCible(reglages, outils.lire)
		outils.journal('Coolify confirme : cette application est la préprod.')
		await poserLeJeton(reglages, outils.lire)
		outils.journal(`Variable ${VARIABLE_DE_REMISE} posée.`)
		await redemarrer(reglages, outils.lire)
		outils.journal('Préprod redémarrée.')
		await attendreLaRemise(reglages, outils)
		return 0
	} catch (erreur) {
		const message =
			erreur instanceof RemiseRefusee
				? erreur.message
				: `une requête a échoué (${raison(erreur)}), sans réponse lisible.`
		outils.journal(`Remise à zéro de la préprod en échec : ${message}`)
		return 1
	}
}

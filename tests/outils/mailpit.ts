/**
 * The client of the mail catcher of the bench (Mailpit). Everything the application sends on the
 * bench lands in the catcher, and nothing leaves the machine: a test reads its mail here.
 *
 *   const mail = await attendreLeMail({ pour: compte.email })
 *   expect(mail.sujet).toBe('…')
 *   const lien = lienDuMail(mail, '/auth/…')
 *
 * A mail is looked up by its recipient. Each test writes to an address of its own, in
 * `@example.test`: two tests that run side by side never read each other's mail.
 *
 * The catcher that is read and emptied is the one of the bench instance this process was started
 * for, and no other. A catcher that does not answer is said in one sentence, within 2 seconds.
 *
 * Only `fetch`, zod and Node's own modules: no API of bun.
 */

import { z } from 'zod'
import { servicesDuBanc, type Variables } from './banc'
import {
	demanderAuBanc,
	enTexte,
	exigerVariablesDuBanc,
	type ReponseDuBanc,
	reponseInattendue,
	type ServiceDuBanc,
} from './banc-requete'
import { verifierEnvoi } from './garde-environnement'

/** The catcher of one bench instance: where its API answers. */
export interface Capteur extends ServiceDuBanc {
	api: string
}

export interface Correspondant {
	nom: string
	adresse: string
}

/** A mail as the catcher received it. */
export interface Mail {
	id: string
	de: Correspondant
	/** Everyone it was sent to: « To », then « Cc », then « Bcc ». */
	destinataires: Correspondant[]
	repondreA: Correspondant[]
	sujet: string
	/**
	 * The text part, with `\n` line ends and without the ones that close it: the transport always
	 * adds one. Empty when the mail has none.
	 */
	texte: string
	/** The HTML part, as it was sent. Empty when the mail has none. */
	html: string
	/** Every web link of the mail: those of the HTML part, then those only the text part holds. */
	liens: string[]
	date: Date
}

/** Which mail a test waits for: its recipient, and its subject when the recipient gets several. */
export interface Critere {
	/** The address the mail was sent to, whole. */
	pour: string
	/** The exact subject, or a pattern it must match. */
	sujet?: string | RegExp
}

export interface Options {
	/** Replaced in a unit test only. By default: the catcher of the bench, checked against the environment. */
	capteur?: Capteur
}

const SERVICE = 'capteur de mails'

/**
 * How long `attendreLeMail` looks for a mail before it gives up. With the deadline of one
 * request, a wait always ends in less than 5 seconds.
 */
export const DELAI_D_ATTENTE_MS = 2500

/** The pause between two looks at the mailbox. */
const PAS_D_ATTENTE_MS = 100

/** Mailpit answers a search by pages. */
const TAILLE_DE_PAGE = 100

/**
 * The catcher of the bench this process works on. Throws `BancRefuse` when the environment does
 * not point at it: the application under test would send somewhere else than where this reads.
 */
export function capteurDuBanc(variables: Variables = process.env): Capteur {
	const { instance, environnement } = exigerVariablesDuBanc(
		SERVICE,
		['MAILPIT_URL', 'SMTP_HOST', 'SMTP_PORT'],
		variables
	)
	return { service: SERVICE, instance, api: servicesDuBanc(environnement).mails.api }
}

const liste = z
	.array(z.object({ Name: z.string(), Address: z.string() }))
	.nullish()
	.transform(correspondants => (correspondants ?? []).map(({ Name, Address }) => ({ nom: Name, adresse: Address })))

/** One line of a search: enough to choose a mail, not its content. */
const Resume = z.object({ ID: z.string(), To: liste, Cc: liste, Bcc: liste, Subject: z.string(), Created: z.string() })
type Resume = z.infer<typeof Resume>

const Recherche = z.object({ messages_count: z.number(), messages: z.array(Resume) })

const Message = Resume.omit({ Created: true }).extend({
	From: z
		.object({ Name: z.string(), Address: z.string() })
		.nullish()
		.transform(de => ({ nom: de?.Name ?? '', adresse: de?.Address ?? '' })),
	ReplyTo: liste,
	Date: z.string(),
	Text: z.string(),
	HTML: z.string(),
})

const Compte = z.object({ total: z.number() })

/** One request to the API of the catcher. The address is checked first: local, or nothing is asked. */
async function demander(capteur: Capteur, chemin: string, requete?: RequestInit): Promise<ReponseDuBanc> {
	verifierEnvoi({ MAILPIT_URL: capteur.api })
	return demanderAuBanc(capteur, `${capteur.api}${chemin}`, requete)
}

/** The answer as the JSON this client expects, or an error that names what was asked. */
function lireJson<Forme extends z.ZodType>(
	capteur: Capteur,
	demande: string,
	reponse: ReponseDuBanc,
	forme: Forme
): z.infer<Forme> {
	if (reponse.statut !== 200) throw reponseInattendue(capteur, demande, reponse)
	let json: unknown
	try {
		json = JSON.parse(enTexte(reponse))
	} catch {
		json = undefined
	}
	const lu = forme.safeParse(json)
	if (!lu.success)
		throw new Error(
			`Le ${capteur.service} du banc « ${capteur.instance.nom} » a répondu autre chose que prévu à la demande « ${demande} ».`
		)
	return lu.data
}

const ENTITES: Readonly<Record<string, string>> = {
	amp: '&',
	apos: "'",
	gt: '>',
	lt: '<',
	nbsp: ' ',
	quot: '"',
}

const caractere = (code: number, defaut: string): string =>
	Number.isInteger(code) && code >= 0 && code <= 0x10_ff_ff ? String.fromCodePoint(code) : defaut

/** The value of an HTML attribute as a browser reads it: `&amp;` is `&`. */
const decoderLesEntites = (valeur: string): string =>
	valeur.replace(/&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z]+));/gi, (tout, decimal, hexa, nom) => {
		if (decimal) return caractere(Number(decimal), tout)
		if (hexa) return caractere(Number.parseInt(hexa, 16), tout)
		return ENTITES[String(nom).toLowerCase()] ?? tout
	})

/** The `href` of each `<a>`, whatever quotes it is written with. */
const LIEN_HTML = /<a\s[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi
const LIEN_TEXTE = /https?:\/\/[^\s<>"']+/gi
/** What ends a sentence, not an address. */
const PONCTUATION_FINALE = /[.,;:!?)\]]+$/

/**
 * Every web link of a mail, each once, in reading order: the links of the HTML part, then the
 * addresses only the text part holds. Anything else than http and https is left out (`mailto:`).
 */
export function extraireLesLiens(html: string, texte = ''): string[] {
	const duHtml = [...html.matchAll(LIEN_HTML)].map(([, double, simple, nu]) =>
		decoderLesEntites(double ?? simple ?? nu ?? '').trim()
	)
	const duTexte = [...texte.matchAll(LIEN_TEXTE)].map(([lien]) => lien.replace(PONCTUATION_FINALE, ''))
	return [...new Set([...duHtml, ...duTexte])].filter(lien => /^https?:\/\//i.test(lien) && URL.canParse(lien))
}

/** A link without what follows its path: a query may hold a token, which no message repeats. */
const sansParametres = (lien: string): string => {
	const url = new URL(lien)
	return `${url.origin}${url.pathname}`
}

/**
 * The link of this mail that leads to a page: `vers` is the exact path of the link
 * (« /auth/reinitialiser »), or a pattern the whole link must match. The first one in reading
 * order; an error that lists the links of the mail when there is none.
 */
export function lienDuMail(mail: Pick<Mail, 'liens' | 'sujet'>, vers: string | RegExp): string {
	const trouve = mail.liens.find(lien => (typeof vers === 'string' ? new URL(lien).pathname === vers : vers.test(lien)))
	if (trouve) return trouve
	const cherche = typeof vers === 'string' ? `vers « ${vers} »` : `qui corresponde à ${vers}`
	const liens = mail.liens.map(sansParametres)
	throw new Error(
		`Aucun lien ${cherche} dans le mail « ${mail.sujet} ». ${
			liens.length > 0 ? `Ses liens, sans leurs paramètres : ${liens.join(', ')}.` : 'Il ne contient aucun lien.'
		}`
	)
}

const memeAdresse = (une: string, autre: string): boolean => une.toLowerCase() === autre.toLowerCase()

/** An address that can be written between quotes in a search of Mailpit. */
const ADRESSE_CHERCHABLE = /^[^\s"<>@]+@[^\s"<>@]+$/

/** The mails this address received, most recent first: one line each. */
async function chercher(capteur: Capteur, pour: string): Promise<Resume[]> {
	if (!ADRESSE_CHERCHABLE.test(pour)) throw new Error('Adresse illisible : une adresse entière est attendue.')
	const resumes: Resume[] = []
	for (;;) {
		const parametres = new URLSearchParams({
			// Mailpit matches a part of an address: the exact one is kept below.
			query: `addressed:"${pour}"`,
			limit: String(TAILLE_DE_PAGE),
			start: String(resumes.length),
		})
		const page = lireJson(capteur, 'chercher', await demander(capteur, `/api/v1/search?${parametres}`), Recherche)
		resumes.push(...page.messages)
		if (page.messages.length === 0 || resumes.length >= page.messages_count) break
	}
	return resumes
		.filter(({ To, Cc, Bcc }) => [...To, ...Cc, ...Bcc].some(({ adresse }) => memeAdresse(adresse, pour)))
		.sort((un, autre) => autre.Created.localeCompare(un.Created))
}

async function lire(capteur: Capteur, id: string): Promise<Mail> {
	const reponse = await demander(capteur, `/api/v1/message/${encodeURIComponent(id)}`)
	const message = lireJson(capteur, 'lire un mail', reponse, Message)
	const texte = message.Text.replaceAll('\r\n', '\n').replace(/\n+$/, '')
	return {
		id: message.ID,
		de: message.From,
		destinataires: [...message.To, ...message.Cc, ...message.Bcc],
		repondreA: message.ReplyTo,
		sujet: message.Subject,
		texte,
		html: message.HTML,
		liens: extraireLesLiens(message.HTML, texte),
		date: new Date(message.Date),
	}
}

const sujetConvient = (sujet: string, attendu: Critere['sujet']): boolean =>
	attendu === undefined || (typeof attendu === 'string' ? sujet === attendu : attendu.test(sujet))

const pause = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

const enSecondes = (ms: number): string => String(ms / 1000).replace('.', ',')

/** Every mail this address received, most recent first. Empty when it received none: nothing is waited for. */
export async function mailsRecus(pour: string, { capteur = capteurDuBanc() }: Options = {}): Promise<Mail[]> {
	const resumes = await chercher(capteur, pour)
	return Promise.all(resumes.map(({ ID }) => lire(capteur, ID)))
}

/**
 * The mail this address received, as soon as it is there: the most recent one when there are
 * several. Looks at the mailbox until `delaiMs` is over, then fails with what the address did
 * receive.
 */
export async function attendreLeMail(
	critere: Critere,
	{ capteur = capteurDuBanc(), delaiMs = DELAI_D_ATTENTE_MS }: Options & { delaiMs?: number } = {}
): Promise<Mail> {
	const fin = Date.now() + delaiMs
	for (;;) {
		const resumes = await chercher(capteur, critere.pour)
		const trouve = resumes.find(({ Subject }) => sujetConvient(Subject, critere.sujet))
		if (trouve) return lire(capteur, trouve.ID)
		if (Date.now() >= fin) {
			const attendu =
				critere.sujet === undefined
					? ''
					: ` dont le sujet ${typeof critere.sujet === 'string' ? `soit « ${critere.sujet} »` : `corresponde à ${critere.sujet}`}`
			const recus =
				resumes.length === 0
					? 'Cette adresse n’en a reçu aucun.'
					: `Cette adresse en a reçu ${resumes.length}, sous un autre sujet : ${resumes.map(({ Subject }) => `« ${Subject} »`).join(', ')}.`
			throw new Error(
				`Aucun mail pour « ${critere.pour} »${attendu} dans le ${capteur.service} au bout de ${enSecondes(delaiMs)} s. ${recus}`
			)
		}
		await pause(PAS_D_ATTENTE_MS)
	}
}

/** How many mails the catcher holds, whoever they are for. */
export async function compterLesMails({ capteur = capteurDuBanc() }: Options = {}): Promise<number> {
	return lireJson(capteur, 'compter les mails', await demander(capteur, '/api/v1/messages?limit=1'), Compte).total
}

/** Reset: deletes every mail of the catcher. */
export async function viderLeCapteur({ capteur = capteurDuBanc() }: Options = {}): Promise<void> {
	const reponse = await demander(capteur, '/api/v1/messages', { method: 'DELETE' })
	if (reponse.statut !== 200) throw reponseInattendue(capteur, 'vider', reponse)
}

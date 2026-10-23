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
import { benchServices, type Variables } from './bench'
import {
	type BenchResponse,
	type BenchService,
	inText,
	requestBench,
	requireBenchVariables,
	unexpectedResponse,
} from './bench-request'
import { checkUpload } from './environment-guard'

/** The catcher of one bench instance: where its API answers. */
export interface Sink extends BenchService {
	api: string
}

export interface Matching {
	nom: string
	adresse: string
}

/** A mail as the catcher received it. */
export interface Mail {
	id: string
	de: Matching
	/** Everyone it was sent to: « To », then « Cc », then « Bcc ». */
	destinataires: Matching[]
	repondreA: Matching[]
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
export interface Criterion {
	/** The address the mail was sent to, whole. */
	pour: string
	/** The exact subject, or a pattern it must match. */
	sujet?: string | RegExp
}

export interface Options {
	/** Replaced in a unit test only. By default: the catcher of the bench, checked against the environment. */
	capteur?: Sink
}

const SERVICE = 'capteur de mails'

/**
 * How long `attendreLeMail` looks for a mail before it gives up. With the deadline of one
 * request, a wait always ends in less than 5 seconds.
 */
export const WAITING_DELAY_MS = 2500

/** The pause between two looks at the mailbox. */
const NOT_WAITING_MS = 100

/** Mailpit answers a search by pages. */
const PAGE_SIZE = 100

/**
 * The catcher of the bench this process works on. Throws `BancRefuse` when the environment does
 * not point at it: the application under test would send somewhere else than where this reads.
 */
export function benchSink(variables: Variables = process.env): Sink {
	const { instance, environnement: environment } = requireBenchVariables(
		SERVICE,
		['MAILPIT_URL', 'SMTP_HOST', 'SMTP_PORT'],
		variables
	)
	return { service: SERVICE, instance, api: benchServices(environment).mails.api }
}

const list = z
	.array(z.object({ Name: z.string(), Address: z.string() }))
	.nullish()
	.transform(correspondants => (correspondants ?? []).map(({ Name, Address }) => ({ nom: Name, adresse: Address })))

/** One line of a search: enough to choose a mail, not its content. */
const Resume = z.object({ ID: z.string(), To: list, Cc: list, Bcc: list, Subject: z.string(), Created: z.string() })
type Resume = z.infer<typeof Resume>

const Search = z.object({ messages_count: z.number(), messages: z.array(Resume) })

const Message = Resume.omit({ Created: true }).extend({
	From: z
		.object({ Name: z.string(), Address: z.string() })
		.nullish()
		.transform(de => ({ nom: de?.Name ?? '', adresse: de?.Address ?? '' })),
	ReplyTo: list,
	Date: z.string(),
	Text: z.string(),
	HTML: z.string(),
})

const Account = z.object({ total: z.number() })

/** One request to the API of the catcher. The address is checked first: local, or nothing is asked. */
async function makeRequest(capteur: Sink, chemin: string, requete?: RequestInit): Promise<BenchResponse> {
	checkUpload({ MAILPIT_URL: capteur.api })
	return requestBench(capteur, `${capteur.api}${chemin}`, requete)
}

/** The answer as the JSON this client expects, or an error that names what was asked. */
function readJson<Forme extends z.ZodType>(
	capteur: Sink,
	demande: string,
	reponse: BenchResponse,
	forme: Forme
): z.infer<Forme> {
	if (reponse.statut !== 200) throw unexpectedResponse(capteur, demande, reponse)
	let json: unknown
	try {
		json = JSON.parse(inText(reponse))
	} catch {
		json = undefined
	}
	const wasRead = forme.safeParse(json)
	if (!wasRead.success)
		throw new Error(
			`Le ${capteur.service} du banc « ${capteur.instance.nom} » a répondu autre chose que prévu à la demande « ${demande} ».`
		)
	return wasRead.data
}

const ENTITIES: Readonly<Record<string, string>> = {
	amp: '&',
	apos: "'",
	gt: '>',
	lt: '<',
	nbsp: ' ',
	quot: '"',
}

const character = (code: number, defaut: string): string =>
	Number.isInteger(code) && code >= 0 && code <= 0x10_ff_ff ? String.fromCodePoint(code) : defaut

/** The value of an HTML attribute as a browser reads it: `&amp;` is `&`. */
const decodeEntities = (valeur: string): string =>
	valeur.replace(/&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z]+));/gi, (tout, decimal, hexa, nom) => {
		if (decimal) return character(Number(decimal), tout)
		if (hexa) return character(Number.parseInt(hexa, 16), tout)
		return ENTITIES[String(nom).toLowerCase()] ?? tout
	})

/** The `href` of each `<a>`, whatever quotes it is written with. */
const LINK_HTML = /<a\s[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi
const LINK_TEXT = /https?:\/\/[^\s<>"']+/gi
/** What ends a sentence, not an address. */
const FINAL_PUNCTUATION = /[.,;:!?)\]]+$/

/**
 * Every web link of a mail, each once, in reading order: the links of the HTML part, then the
 * addresses only the text part holds. Anything else than http and https is left out (`mailto:`).
 */
export function extractLinks(html: string, texte = ''): string[] {
	const htmlLinks = [...html.matchAll(LINK_HTML)].map(([, double, simple, nu]) =>
		decodeEntities(double ?? simple ?? nu ?? '').trim()
	)
	const plainText = [...texte.matchAll(LINK_TEXT)].map(([lien]) => lien.replace(FINAL_PUNCTUATION, ''))
	return [...new Set([...htmlLinks, ...plainText])].filter(lien => /^https?:\/\//i.test(lien) && URL.canParse(lien))
}

/** A link without what follows its path: a query may hold a token, which no message repeats. */
const withoutParameters = (lien: string): string => {
	const url = new URL(lien)
	return `${url.origin}${url.pathname}`
}

/**
 * The link of this mail that leads to a page: `vers` is the exact path of the link
 * (« /auth/reinitialiser »), or a pattern the whole link must match. The first one in reading
 * order; an error that lists the links of the mail when there is none.
 */
export function mailLink(mail: Pick<Mail, 'liens' | 'sujet'>, vers: string | RegExp): string {
	const found = mail.liens.find(lien => (typeof vers === 'string' ? new URL(lien).pathname === vers : vers.test(lien)))
	if (found) return found
	const searched = typeof vers === 'string' ? `vers « ${vers} »` : `qui corresponde à ${vers}`
	const links = mail.liens.map(withoutParameters)
	throw new Error(
		`Aucun lien ${searched} dans le mail « ${mail.sujet} ». ${
			links.length > 0 ? `Ses liens, sans leurs paramètres : ${links.join(', ')}.` : 'Il ne contient aucun lien.'
		}`
	)
}

const sameUrl = (une: string, autre: string): boolean => une.toLowerCase() === autre.toLowerCase()

/** An address that can be written between quotes in a search of Mailpit. */
const SEARCHABLE_URL = /^[^\s"<>@]+@[^\s"<>@]+$/

/** The mails this address received, most recent first: one line each. */
async function find(capteur: Sink, pour: string): Promise<Resume[]> {
	if (!SEARCHABLE_URL.test(pour)) throw new Error('Adresse illisible : une adresse entière est attendue.')
	const resumes: Resume[] = []
	for (;;) {
		const parameters = new URLSearchParams({
			// Mailpit matches a part of an address: the exact one is kept below.
			query: `addressed:"${pour}"`,
			limit: String(PAGE_SIZE),
			start: String(resumes.length),
		})
		const page = readJson(capteur, 'chercher', await makeRequest(capteur, `/api/v1/search?${parameters}`), Search)
		resumes.push(...page.messages)
		if (page.messages.length === 0 || resumes.length >= page.messages_count) break
	}
	return resumes
		.filter(({ To, Cc, Bcc }) => [...To, ...Cc, ...Bcc].some(({ adresse }) => sameUrl(adresse, pour)))
		.sort((un, autre) => autre.Created.localeCompare(un.Created))
}

async function read(capteur: Sink, id: string): Promise<Mail> {
	const response = await makeRequest(capteur, `/api/v1/message/${encodeURIComponent(id)}`)
	const message = readJson(capteur, 'lire un mail', response, Message)
	const text = message.Text.replaceAll('\r\n', '\n').replace(/\n+$/, '')
	return {
		id: message.ID,
		de: message.From,
		destinataires: [...message.To, ...message.Cc, ...message.Bcc],
		repondreA: message.ReplyTo,
		sujet: message.Subject,
		texte: text,
		html: message.HTML,
		liens: extractLinks(message.HTML, text),
		date: new Date(message.Date),
	}
}

const subjectFits = (sujet: string, attendu: Criterion['sujet']): boolean =>
	attendu === undefined || (typeof attendu === 'string' ? sujet === attendu : attendu.test(sujet))

const pause = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

const inSeconds = (ms: number): string => String(ms / 1000).replace('.', ',')

/** Every mail this address received, most recent first. Empty when it received none: nothing is waited for. */
export async function mailReceived(pour: string, { capteur = benchSink() }: Options = {}): Promise<Mail[]> {
	const resumes = await find(capteur, pour)
	return Promise.all(resumes.map(({ ID }) => read(capteur, ID)))
}

/**
 * The mail this address received, as soon as it is there: the most recent one when there are
 * several. Looks at the mailbox until `delaiMs` is over, then fails with what the address did
 * receive.
 */
export async function waitMail(
	critere: Criterion,
	{ capteur = benchSink(), delaiMs = WAITING_DELAY_MS }: Options & { delaiMs?: number } = {}
): Promise<Mail> {
	const end = Date.now() + delaiMs
	for (;;) {
		const resumes = await find(capteur, critere.pour)
		const found = resumes.find(({ Subject }) => subjectFits(Subject, critere.sujet))
		if (found) return read(capteur, found.ID)
		if (Date.now() >= end) {
			const expected =
				critere.sujet === undefined
					? ''
					: ` dont le sujet ${typeof critere.sujet === 'string' ? `soit « ${critere.sujet} »` : `corresponde à ${critere.sujet}`}`
			const received =
				resumes.length === 0
					? 'Cette adresse n’en a reçu aucun.'
					: `Cette adresse en a reçu ${resumes.length}, sous un autre sujet : ${resumes.map(({ Subject }) => `« ${Subject} »`).join(', ')}.`
			throw new Error(
				`Aucun mail pour « ${critere.pour} »${expected} dans le ${capteur.service} au bout de ${inSeconds(delaiMs)} s. ${received}`
			)
		}
		await pause(NOT_WAITING_MS)
	}
}

/** How many mails the catcher holds, whoever they are for. */
export async function countMails({ capteur = benchSink() }: Options = {}): Promise<number> {
	return readJson(capteur, 'compter les mails', await makeRequest(capteur, '/api/v1/messages?limit=1'), Account).total
}

/** Reset: deletes every mail of the catcher. */
export async function emptySink({ capteur = benchSink() }: Options = {}): Promise<void> {
	const response = await makeRequest(capteur, '/api/v1/messages', { method: 'DELETE' })
	if (response.statut !== 200) throw unexpectedResponse(capteur, 'vider', response)
}

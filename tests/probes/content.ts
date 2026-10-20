/**
 * What the probes read in a page, as text: the profile addresses of a sitemap, and what the
 * server HTML of a page shows before any JavaScript runs (R03, plan 02 §7.6).
 *
 * Pure functions: nothing here makes a request. The HTML is parsed by jsdom, which neither runs
 * the scripts of the page nor loads anything it links to.
 */

import { createHash } from 'node:crypto'
import { JSDOM } from 'jsdom'

/** A profile page of the site: `/profil/<slug>`, one segment, as the frozen URL table writes it. */
const CHEMIN_DE_PROFIL = /^\/profil\/[^/]+$/

/** The words a page shows when the code printed a missing value: JavaScript writes them so. */
export const MOTS_INTERDITS = ['undefined', 'null'] as const
export type MotInterdit = (typeof MOTS_INTERDITS)[number]

/** Attributes a visitor, a screen reader or a search engine reads as text. */
const ATTRIBUTS_LUS = ['alt', 'title', 'aria-label', 'placeholder'] as const

/** Elements whose content is not shown: the data and code of the page, its styles. */
const NON_AFFICHES = 'script, style, template'

const ENTITES_XML: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

const decoderXml = (texte: string): string =>
	texte.replace(/&(amp|lt|gt|quot|apos);/g, (_entite, nom: string) => ENTITES_XML[nom] ?? '')

/**
 * The profile paths of a sitemap, in its order and without duplicates. The origin of each
 * `<loc>` is dropped: the probes read the path on their own target, whatever origin the
 * sitemap writes.
 */
export function cheminsDeProfils(xml: string): string[] {
	const chemins = new Set<string>()
	for (const [, loc = ''] of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)) {
		const adresse = decoderXml(loc)
		if (!URL.canParse(adresse)) continue
		const { pathname } = new URL(adresse)
		if (CHEMIN_DE_PROFIL.test(pathname)) chemins.add(pathname)
	}
	return [...chemins]
}

/**
 * A short and stable name for a page that may belong to a real person: the first 8 hex digits
 * of the SHA-256 of its path. The report never writes the address of a profile (CLAUDE.md,
 * rule 3); a person who needs it computes the fingerprints of the sitemap on their own machine
 * (docs/tests/sondes.md).
 */
export function empreinte(chemin: string): string {
	return createHash('sha256').update(chemin).digest('hex').slice(0, 8)
}

/** Where a forbidden word was seen, and how many times. Never the text around it. */
export interface Occurrence {
	mot: MotInterdit
	/** `texte`, or the name of the attribute (`alt`, `content` of a meta tag…). */
	lieu: string
	nombre: number
}

export interface LectureDuHtml {
	/** `h1` elements with some text, in the HTML the server sent. */
	titresH1: number
	occurrences: Occurrence[]
}

const compter = (texte: string, mot: MotInterdit): number => texte.match(new RegExp(`\\b${mot}\\b`, 'g'))?.length ?? 0

/**
 * What the server HTML shows: its `h1` titles, and every « undefined » or « null » written as a
 * word in a text, in an attribute read as text, or in the content of a meta tag. The scripts,
 * where the data of the page legitimately holds `null`, are left out.
 */
export function lireLeHtml(html: string): LectureDuHtml {
	const { window } = new JSDOM(html)
	try {
		const { document, NodeFilter } = window
		for (const element of document.querySelectorAll(NON_AFFICHES)) element.remove()

		const titresH1 = [...document.querySelectorAll('h1')].filter(titre => titre.textContent?.trim()).length

		const vus = new Map<string, Occurrence>()
		const noter = (texte: string | null | undefined, lieu: string) => {
			if (!texte) return
			for (const mot of MOTS_INTERDITS) {
				const nombre = compter(texte, mot)
				if (nombre === 0) continue
				const cle = `${mot} ${lieu}`
				const deja = vus.get(cle)
				vus.set(cle, { mot, lieu, nombre: (deja?.nombre ?? 0) + nombre })
			}
		}

		// Text node by text node: two neighbours like « Ville » and « null » are two words, not « Villenull ».
		const parcours = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT)
		for (let noeud = parcours.nextNode(); noeud; noeud = parcours.nextNode()) noter(noeud.nodeValue, 'texte')
		for (const nom of ATTRIBUTS_LUS)
			for (const element of document.querySelectorAll(`[${nom}]`)) noter(element.getAttribute(nom), nom)
		for (const meta of document.querySelectorAll('meta[content]'))
			noter(meta.getAttribute('content'), 'content d’une balise meta')

		return { titresH1, occurrences: [...vus.values()] }
	} finally {
		window.close()
	}
}

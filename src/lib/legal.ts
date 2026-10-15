/**
 * The legal identity of the publisher and of the host, in one place: the three legal pages
 * (/mentions-legales, /cgu, /politique-de-confidentialite) read it and nothing else writes it
 * (ticket 112; the text is taken from the live site, `src/lib/legal.js` there).
 *
 * Publisher: SIRENE record of the sole proprietorship, read on 2026-10-08 from
 * recherche-entreprises.api.gouv.fr: the active head office opened on 2026-03-23 (the Nantes
 * establishment closed on 2024-10-08). The address is copied as the register spells it.
 * Host: netcup GmbH legal notice (netcup.de/kontakt/impressum.php), 2026-10-08.
 */

export const EDITEUR = {
	nom: 'Andy Cinquin',
	forme: 'entreprise individuelle',
	siren: '880505276',
	siret: '88050527600035',
	adresse: '1250 Chemin de la Renouillere, 74140 Sciez, France',
	email: 'contact@my-makeup.fr',
	// To confirm by the owner: the number comes from the former /cgu page of the live site.
	telephone: '+33 6 21 58 26 84',
	directeurPublication: 'Andy Cinquin',
} as const

export const HEBERGEUR = {
	nom: 'netcup GmbH',
	adresse: 'Emmy-Noether-Straße 10, 76131 Karlsruhe, Allemagne',
	telephone: '+49 721 7540755-0',
	site: 'https://www.netcup.com',
} as const

/** Luhn checksum used by SIREN and SIRET numbers. */
export function luhnValid(chiffres: string): boolean {
	if (!/^\d+$/.test(chiffres)) return false
	let somme = 0
	;[...chiffres].reverse().forEach((caractere, rang) => {
		let valeur = Number(caractere)
		if (rang % 2 === 1) {
			valeur *= 2
			if (valeur > 9) valeur -= 9
		}
		somme += valeur
	})
	return somme % 10 === 0
}

/** The SIREN printed the usual way: three groups of three digits. */
export const formatSiren = (siren: string): string => `${siren.slice(0, 3)} ${siren.slice(3, 6)} ${siren.slice(6, 9)}`

/** The SIRET printed the usual way: the SIREN, then the five digits of the establishment. */
export const formatSiret = (siret: string): string => `${formatSiren(siret.slice(0, 9))} ${siret.slice(9)}`

/**
 * Legal identity of the publisher and of the host, shared by /mentions-legales,
 * /cgu and /politique-de-confidentialite.
 *
 * Publisher: SIRENE record of the sole proprietorship, read on 2026-10-08 from
 * recherche-entreprises.api.gouv.fr: the active head office opened on
 * 2026-03-23 (the Nantes establishment closed on 2024-10-08). The address is
 * copied as the register spells it.
 * Host: netcup GmbH legal notice (netcup.de/kontakt/impressum.php), 2026-10-08.
 */

export const EDITEUR = {
	nom: 'Andy Cinquin',
	forme: 'entreprise individuelle',
	siren: '880505276',
	siret: '88050527600035',
	adresse: '1250 Chemin de la Renouillere, 74140 Sciez, France',
	email: 'contact@my-makeup.fr',
	// TODO(Andy): number taken from the former /cgu page, confirm it is current.
	telephone: '+33 6 21 58 26 84',
	directeurPublication: 'Andy Cinquin',
}

export const HEBERGEUR = {
	nom: 'netcup GmbH',
	adresse: 'Emmy-Noether-Straße 10, 76131 Karlsruhe, Allemagne',
	telephone: '+49 721 7540755-0',
	site: 'https://www.netcup.com',
}

/**
 * Luhn checksum used by SIREN and SIRET numbers.
 * @param {string} digits
 * @returns {boolean}
 */
export function luhnValid(digits) {
	if (!/^\d+$/.test(String(digits))) return false
	let sum = 0
	const reversed = String(digits).split('').reverse()
	reversed.forEach((char, index) => {
		let value = Number(char)
		if (index % 2 === 1) {
			value *= 2
			if (value > 9) value -= 9
		}
		sum += value
	})
	return sum % 10 === 0
}

/**
 * SIREN printed the usual way: 880 505 276.
 * @param {string} siren
 * @returns {string}
 */
export function formatSiren(siren) {
	const s = String(siren)
	return `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6, 9)}`
}

/**
 * SIRET printed the usual way: 880 505 276 00035.
 * @param {string} siret
 * @returns {string}
 */
export function formatSiret(siret) {
	const s = String(siret)
	return `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6, 9)} ${s.slice(9)}`
}

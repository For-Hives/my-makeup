/**
 * The address of the client, as the proxy saw it (ticket 076).
 *
 * The site is reached through the proxy only (Traefik, in Coolify). The proxy writes the address
 * it sees at the END of `X-Forwarded-For` (or replaces the whole header): the last entry is the
 * real client, the first ones are whatever the client chose to write. Counting by the first entry
 * would give a script a fresh counter at each request.
 *
 * `X-Real-IP` is never read: a client can send it, and the proxy always sets `X-Forwarded-For`.
 *
 * An IPv6 address counts by its /64 block: a provider gives each subscriber a whole /64, and a
 * script would walk through its last digits. All the spellings of one block give one key. An IPv4
 * address seen by an IPv6 socket (`::ffff:203.0.113.7`) becomes `203.0.113.7` again.
 *
 * Without the header (a call outside the proxy: development, a test), the key is `local`.
 * The key is used to count, never to write: it must not appear in a log.
 */

export const SANS_PROXY = 'local'

const LONGUEUR_MAX = 100

/** The eight 16-bit groups of an IPv6 address in any spelling; `null` when it is not one. */
function groupesIPv6(adresse: string): number[] | null {
	let a = adresse.toLowerCase()
	if (a.startsWith('[') && a.endsWith(']')) a = a.slice(1, -1)
	// A zone (`fe80::1%eth0`) does not name another machine.
	a = a.split('%')[0] ?? ''
	const v4 = /^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(a)
	if (v4) {
		const o = v4.slice(2).map(Number) as [number, number, number, number]
		if (o.some(x => x > 255)) return null
		a = `${v4[1]}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`
	}
	const moities = a.split('::')
	if (moities.length > 2) return null
	const groupes = (s: string | undefined) => (s ? s.split(':') : [])
	const tete = groupes(moities[0])
	const queue = moities.length === 2 ? groupes(moities[1]) : []
	const manquants = 8 - tete.length - queue.length
	if (moities.length === 2 ? manquants < 1 : manquants !== 0) return null
	const tous = [...tete, ...Array<string>(moities.length === 2 ? manquants : 0).fill('0'), ...queue]
	if (!tous.every(g => /^[0-9a-f]{1,4}$/.test(g))) return null
	return tous.map(g => Number.parseInt(g, 16))
}

/** The key of an address: its /64 block for an IPv6, itself otherwise. */
export function cleDeAdresse(adresse: string): string {
	if (!adresse.includes(':')) return adresse
	const g = groupesIPv6(adresse)
	if (!g) return adresse
	if (g.slice(0, 5).every(x => x === 0) && g[5] === 0xffff) {
		const [h, b] = [g[6] ?? 0, g[7] ?? 0]
		return `${h >> 8}.${h & 255}.${b >> 8}.${b & 255}`
	}
	return `${g
		.slice(0, 4)
		.map(x => x.toString(16))
		.join(':')}::/64`
}

/** The 128-bit value of an address (IPv4 as an IPv4-mapped IPv6), or `null` when it is not one. */
function valeurDAdresse(adresse: string): bigint | null {
	const a = adresse.trim()
	let groupes: number[] | null = null
	if (/^\d{1,3}(\.\d{1,3}){3}$/.test(a)) groupes = groupesIPv6(`::ffff:${a}`)
	else if (a.includes(':')) groupes = groupesIPv6(a)
	if (!groupes) return null
	return groupes.reduce((acc, x) => (acc << 16n) | BigInt(x), 0n)
}

type Plage = { debut: bigint; bits: number }

/** `TRUSTED_PROXY_CIDRS`: comma-separated addresses or CIDR ranges. An invalid item is ignored. */
export function plagesDeConfiguration(brut: string | undefined): Plage[] {
	const plages: Plage[] = []
	for (const item of (brut ?? '').split(',')) {
		const [adresse = '', masque] = item.trim().split('/')
		if (adresse === '') continue
		const v4 = !adresse.includes(':')
		const valeur = valeurDAdresse(adresse)
		if (valeur === null) continue
		const max = v4 ? 32 : 128
		const longueur = masque === undefined ? max : /^\d{1,3}$/.test(masque) ? Number(masque) : Number.NaN
		if (!(longueur >= 0 && longueur <= max)) continue
		const bits = 128 - max + longueur
		const decalage = BigInt(128 - bits)
		plages.push({ bits, debut: (valeur >> decalage) << decalage })
	}
	return plages
}

function estDeConfiance(adresse: string, plages: Plage[]): boolean {
	const valeur = valeurDAdresse(adresse.replace(/^\[|\]$/g, ''))
	if (valeur === null) return false
	return plages.some(({ debut, bits }) => {
		const decalage = BigInt(128 - bits)
		return (valeur >> decalage) << decalage === debut
	})
}

let memo: { brut: string | undefined; plages: Plage[] } | undefined
const plagesDeConfiance = (): Plage[] => {
	const brut = process.env.TRUSTED_PROXY_CIDRS
	if (!memo || memo.brut !== brut) memo = { brut, plages: plagesDeConfiguration(brut) }
	return memo.plages
}

/**
 * The client of the request, as a key; `local` when there is no header.
 *
 * Without `TRUSTED_PROXY_CIDRS`, one proxy hop is assumed and the last entry of `X-Forwarded-For`
 * is the client. With it, the entries are walked from the right and those inside the trusted
 * ranges (a CDN, a second proxy) are skipped: the first entry that is not trusted is the client.
 * When every entry is trusted, the leftmost one is used.
 */
export function ipClient(entetes: Headers): string {
	const entrees = (entetes.get('x-forwarded-for') ?? '')
		.split(',')
		.map(e => e.trim().slice(0, LONGUEUR_MAX))
		.filter(e => e !== '')
	if (entrees.length === 0) return SANS_PROXY
	const plages = plagesDeConfiance()
	const client =
		plages.length === 0 ? entrees.at(-1) : (entrees.findLast(e => !estDeConfiance(e, plages)) ?? entrees[0])
	return client ? cleDeAdresse(client) : SANS_PROXY
}

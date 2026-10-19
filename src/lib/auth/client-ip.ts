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

export const NO_PROXY = 'local'

const MAX_LENGTH = 100

/** The eight 16-bit groups of an IPv6 address in any spelling; `null` when it is not one. */
function ipv6Groups(adresse: string): number[] | null {
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
	const halves = a.split('::')
	if (halves.length > 2) return null
	const groups = (s: string | undefined) => (s ? s.split(':') : [])
	const head = groups(halves[0])
	const queue = halves.length === 2 ? groups(halves[1]) : []
	const missing = 8 - head.length - queue.length
	if (halves.length === 2 ? missing < 1 : missing !== 0) return null
	const all = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...queue]
	if (!all.every(g => /^[0-9a-f]{1,4}$/.test(g))) return null
	return all.map(g => Number.parseInt(g, 16))
}

/** The key of an address: its /64 block for an IPv6, itself otherwise. */
export function addressKey(adresse: string): string {
	if (!adresse.includes(':')) return adresse
	const g = ipv6Groups(adresse)
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
function addressValue(adresse: string): bigint | null {
	const a = adresse.trim()
	let groups: number[] | null = null
	if (/^\d{1,3}(\.\d{1,3}){3}$/.test(a)) groups = ipv6Groups(`::ffff:${a}`)
	else if (a.includes(':')) groups = ipv6Groups(a)
	if (!groups) return null
	return groups.reduce((acc, x) => (acc << 16n) | BigInt(x), 0n)
}

type IpRange = { debut: bigint; bits: number }

/** `TRUSTED_PROXY_CIDRS`: comma-separated addresses or CIDR ranges. An invalid item is ignored. */
export function configuredRanges(brut: string | undefined): IpRange[] {
	const ranges: IpRange[] = []
	for (const item of (brut ?? '').split(',')) {
		const [ip = '', masked] = item.trim().split('/')
		if (ip === '') continue
		const v4 = !ip.includes(':')
		const value = addressValue(ip)
		if (value === null) continue
		const max = v4 ? 32 : 128
		const length = masked === undefined ? max : /^\d{1,3}$/.test(masked) ? Number(masked) : Number.NaN
		if (!(length >= 0 && length <= max)) continue
		const bits = 128 - max + length
		const offset = BigInt(128 - bits)
		ranges.push({ bits, debut: (value >> offset) << offset })
	}
	return ranges
}

function isTrusted(adresse: string, plages: IpRange[]): boolean {
	const value = addressValue(adresse.replace(/^\[|\]$/g, ''))
	if (value === null) return false
	return plages.some(({ debut, bits }) => {
		const offset = BigInt(128 - bits)
		return (value >> offset) << offset === debut
	})
}

let memo: { brut: string | undefined; plages: IpRange[] } | undefined
const trustedRanges = (): IpRange[] => {
	const raw = process.env.TRUSTED_PROXY_CIDRS
	if (!memo || memo.brut !== raw) memo = { brut: raw, plages: configuredRanges(raw) }
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
	const inputs = (entetes.get('x-forwarded-for') ?? '')
		.split(',')
		.map(e => e.trim().slice(0, MAX_LENGTH))
		.filter(e => e !== '')
	if (inputs.length === 0) return NO_PROXY
	const ranges = trustedRanges()
	const client = ranges.length === 0 ? inputs.at(-1) : (inputs.findLast(e => !isTrusted(e, ranges)) ?? inputs[0])
	return client ? addressKey(client) : NO_PROXY
}

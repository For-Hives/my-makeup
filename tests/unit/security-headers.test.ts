import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { NextConfig } from 'next'
// Three functions of Next itself, the ones its server runs on each request: which header entries
// apply to a path, how their values are written, and whether `/_next/image` may fetch an address.
// The tests then say what Next does with next.config.ts, not what the file looks like.
import { buildCustomRoute } from 'next/dist/server/lib/router-utils/filesystem'
import { hasRemoteMatch } from 'next/dist/shared/lib/match-remote-pattern'
import { compileNonPath } from 'next/dist/shared/lib/router/utils/prepare-destination'
import { EnvError, MEDIA_ORIGIN_DEFAULT, mediaOrigin } from '@/lib/env'
import { benchImages, contentSecurityPolicy, mediaRemotePattern, securityHeaders } from '@/lib/security-headers'

// Made-up hosts only: a name in `.test` never resolves.
const OTHER_MEDIA = 'https://medias.exemple.test'

type Env = { NODE_ENV?: string; R2_PUBLIC_URL?: string }

const VARIABLES = ['NODE_ENV', 'R2_PUBLIC_URL'] as const

let loads = 0

/**
 * The real next.config.ts, withPayload included, evaluated again under exactly this environment:
 * a variable left by the shell or by another test does not leak in.
 */
async function configUnder(env: Env): Promise<NextConfig> {
	const before = VARIABLES.map(name => [name, process.env[name]] as const)
	const set = (name: string, value: string | undefined) => {
		if (value === undefined) Reflect.deleteProperty(process.env, name)
		else Reflect.set(process.env, name, value)
	}
	for (const name of VARIABLES) set(name, env[name])
	try {
		// A new query string gives a new instance of the module, so it reads the environment again.
		const loaded = (await import(`../../next.config.ts?load=${++loads}`)) as { default: NextConfig }
		return loaded.default
	} finally {
		for (const [name, value] of before) set(name, value)
	}
}

const production = () => configUnder({ NODE_ENV: 'production' })

/**
 * The headers Next attaches to a request for this path, as its router does: every entry whose
 * source matches, in order, a later one replacing an earlier one, each value rewritten with the
 * parameters of the path. Names in lower case.
 */
async function headersSentFor(config: NextConfig, pathname: string): Promise<Map<string, string>> {
	const sent = new Map<string, string>()
	for (const entry of (await config.headers?.()) ?? []) {
		// No entry is conditional today. One that is would not be sent to every visitor: left out.
		if (entry.has || entry.missing) continue
		const params = buildCustomRoute('header', entry).match(pathname)
		if (!params) continue
		const rewritten = Object.keys(params).length > 0
		for (const { key, value } of entry.headers)
			sent.set(key.toLowerCase(), rewritten ? compileNonPath(value, params) : value)
	}
	return sent
}

const HEADER_NAMES = [
	'strict-transport-security',
	'x-content-type-options',
	'referrer-policy',
	'permissions-policy',
	'content-security-policy-report-only',
	'x-frame-options',
	'content-security-policy',
] as const

const valuesOf = (sent: Map<string, string>) => HEADER_NAMES.map(name => sent.get(name))

/** The sources of one directive of a policy; empty when the directive is missing. */
function sourcesOf(policy: string, directive: string): string[] {
	for (const part of policy.split(';')) {
		const [name, ...sources] = part.trim().split(/\s+/)
		if (name === directive) return sources
	}
	return []
}

/** Everything a policy names that is neither a keyword in quotes nor `data:` or `blob:`. */
const remoteSources = (policy: string) =>
	policy
		.split(';')
		.flatMap(part => part.trim().split(/\s+/).slice(1))
		.filter(source => !source.startsWith("'") && source !== 'data:' && source !== 'blob:')

describe('every response leaves with the security headers', () => {
	test('the home page has the seven headers, and none that names the technology', async () => {
		const config = await production()
		const sent = await headersSentFor(config, '/')

		expect(sent.get('strict-transport-security')).toBe('max-age=31536000')
		expect(sent.get('x-content-type-options')).toBe('nosniff')
		expect(sent.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
		expect(sent.get('permissions-policy')).toBe('camera=(), geolocation=(), microphone=(), payment=(), usb=()')
		expect(sent.get('content-security-policy-report-only')).toBe(
			contentSecurityPolicy({ development: false, mediaOrigin: MEDIA_ORIGIN_DEFAULT })
		)
		expect(sent.get('x-frame-options')).toBe('SAMEORIGIN')
		expect(sent.get('content-security-policy')).toBe("frame-ancestors 'self'")

		// Next adds « X-Powered-By: Next.js » unless told not to, and withPayload its own
		// « Next.js, Payload » as a header entry: both must be off.
		expect(config.poweredByHeader).toBe(false)
		expect(sent.has('x-powered-by')).toBe(false)
		expect(sent.has('server')).toBe(false)
		expect([...sent.values()].join(' ')).not.toMatch(/next\.js|payload/i)
	})

	test.each([
		'/auth',
		'/auth/profil',
		'/admin',
		'/admin/collections/admins',
		'/api/health',
		'/profil/une-maquilleuse',
		'/_next/image',
		'/_next/static/chunks/main.js',
		'/une/adresse/qui/n-existe/pas',
	])('%s has the same seven, with the same values, and no technology header', async pathname => {
		const config = await production()
		const sent = await headersSentFor(config, pathname)

		expect(valuesOf(sent)).toEqual(valuesOf(await headersSentFor(config, '/')))
		expect(valuesOf(sent)).not.toContain(undefined)
		expect(sent.has('x-powered-by')).toBe(false)
	})

	test('the seven are exactly these, whatever the options', () => {
		const names = (development: boolean) =>
			securityHeaders({ development, mediaOrigin: OTHER_MEDIA }).map(({ key }) => key.toLowerCase())

		expect(names(false)).toEqual([...HEADER_NAMES])
		expect(names(true)).toEqual([...HEADER_NAMES])
	})
})

describe('no page is shown inside the frame of another site (ticket 271)', () => {
	test.each([
		'/',
		'/auth/signin',
		'/admin',
		'/profil/une-maquilleuse',
		'/api/health',
		'/robots.txt',
		'/_next/image',
	])('%s forbids a frame of another origin, twice', async pathname => {
		for (const config of [await production(), await configUnder({ NODE_ENV: 'development' })]) {
			const sent = await headersSentFor(config, pathname)
			expect(sent.get('x-frame-options')).toBe('SAMEORIGIN')
			// The enforced policy holds this directive and no other: scripts would need nonces.
			expect(sent.get('content-security-policy')).toBe("frame-ancestors 'self'")
		}
	})

	test('the report-only policy is unchanged, and the enforced one is only the frame rule', () => {
		const options = { development: false, mediaOrigin: MEDIA_ORIGIN_DEFAULT }
		const enforced = securityHeaders(options).find(({ key }) => key === 'Content-Security-Policy')
		expect(enforced?.value).toBe("frame-ancestors 'self'")
		expect(contentSecurityPolicy(options)).toContain("frame-ancestors 'self'")
	})
})

describe('the content policy is in report-only mode and names no third-party domain', () => {
	test('the full policy is only ever sent in report-only mode', async () => {
		for (const config of [await production(), await configUnder({ NODE_ENV: 'development' })]) {
			const sent = await headersSentFor(config, '/')
			expect(sent.has('content-security-policy-report-only')).toBe(true)
			expect(sent.get('content-security-policy')).not.toContain('default-src')
		}
	})

	test('the photos are the only remote origin: nothing for measurement, no report sent elsewhere', async () => {
		const policy = (await headersSentFor(await production(), '/')).get('content-security-policy-report-only') ?? ''

		expect(remoteSources(policy)).toEqual([MEDIA_ORIGIN_DEFAULT])
		expect(sourcesOf(policy, 'img-src')).toEqual(["'self'", 'data:', 'blob:', MEDIA_ORIGIN_DEFAULT])
		// Scripts and requests stay on the site: the measurement script and its sends go through /u.
		expect(sourcesOf(policy, 'script-src')).toEqual(["'self'", "'unsafe-inline'"])
		expect(sourcesOf(policy, 'connect-src')).toEqual(["'self'"])
		expect(sourcesOf(policy, 'default-src')).toEqual(["'self'"])
		expect(policy).not.toContain('*')
		expect(policy).not.toMatch(/umami|report-uri|report-to/i)
	})

	test('`eval` is allowed under `next dev` only', async () => {
		const policyOf = async (env: Env) =>
			(await headersSentFor(await configUnder(env), '/')).get('content-security-policy-report-only') ?? ''

		expect(sourcesOf(await policyOf({ NODE_ENV: 'development' }), 'script-src')).toContain("'unsafe-eval'")
		expect(await policyOf({ NODE_ENV: 'production' })).not.toContain('unsafe-eval')
		expect(await policyOf({ NODE_ENV: 'test' })).not.toContain('unsafe-eval')
		expect(await policyOf({})).not.toContain('unsafe-eval')
	})

	test('it follows the media origin the build was given', async () => {
		const config = await configUnder({ NODE_ENV: 'production', R2_PUBLIC_URL: OTHER_MEDIA })
		const policy = (await headersSentFor(config, '/')).get('content-security-policy-report-only') ?? ''

		expect(remoteSources(policy)).toEqual([OTHER_MEDIA])
	})
})

describe('the photos of an environment (ticket 230)', () => {
	// What a build gives when R2_PUBLIC_URL names another host: its own bucket, not the one of the live site.
	const OTHER_BUCKET = 'https://exemple-photos.example.test'
	const imgSources = async (env: Env) =>
		sourcesOf(
			(await headersSentFor(await configUnder(env), '/')).get('content-security-policy-report-only') ?? '',
			'img-src'
		)

	test('the policy names the host of R2_PUBLIC_URL and not the one of the live site', async () => {
		const sources = await imgSources({ NODE_ENV: 'production', R2_PUBLIC_URL: OTHER_BUCKET })

		expect(sources).toContain(OTHER_BUCKET)
		expect(sources).not.toContain(MEDIA_ORIGIN_DEFAULT)
	})

	test('without the variable, or empty as an unset build argument may leave it, it names the live site', async () => {
		for (const R2_PUBLIC_URL of [undefined, '']) {
			const sources = await imgSources({ NODE_ENV: 'production', R2_PUBLIC_URL })

			expect(sources).toContain(MEDIA_ORIGIN_DEFAULT)
			expect(sources).not.toContain(OTHER_BUCKET)
		}
	})
})

describe('the image optimizer fetches from the media host only', () => {
	/** What `/_next/image` answers to `?url=<address>`: true when it would fetch it. */
	const fetched = (config: NextConfig, address: string) =>
		hasRemoteMatch(config.images?.domains ?? [], config.images?.remotePatterns ?? [], new URL(address))

	test('a photo of the media host is accepted, at the root and in a folder', async () => {
		const config = await production()

		expect(fetched(config, `${MEDIA_ORIGIN_DEFAULT}/photo.webp`)).toBe(true)
		expect(fetched(config, `${MEDIA_ORIGIN_DEFAULT}/dossier/sous-dossier/photo.jpg`)).toBe(true)
	})

	test.each([
		['another host', 'https://images.exemple.test/photo.webp'],
		['the media host over http', `${MEDIA_ORIGIN_DEFAULT.replace('https:', 'http:')}/photo.webp`],
		['the media host on another port', `${MEDIA_ORIGIN_DEFAULT}:8443/photo.webp`],
		['a host that ends like the media host', `https://faux-${new URL(MEDIA_ORIGIN_DEFAULT).hostname}/photo.webp`],
		['a host that starts like the media host', `${MEDIA_ORIGIN_DEFAULT}.exemple.test/photo.webp`],
		['a sub-domain of the media host', `https://sous.${new URL(MEDIA_ORIGIN_DEFAULT).hostname}/photo.webp`],
		['the site itself, written as a remote address', 'https://my-makeup.fr/favicon.webp'],
	])('%s is refused', async (_case, address) => {
		expect(fetched(await production(), address)).toBe(false)
	})

	test('one pattern, no list of domains, and no door left open to local addresses or to SVG', async () => {
		const { images } = await production()

		expect(images?.remotePatterns).toEqual([
			{ hostname: 'r2-my-makeup.andy-cinquin.fr', pathname: '/**', port: '', protocol: 'https' },
		])
		expect(images?.domains ?? []).toEqual([])
		expect(images?.dangerouslyAllowLocalIP ?? false).toBe(false)
		expect(images?.dangerouslyAllowSVG ?? false).toBe(false)
	})

	test('R2_PUBLIC_URL moves the one accepted host: the default one is then refused', async () => {
		const config = await configUnder({ NODE_ENV: 'production', R2_PUBLIC_URL: OTHER_MEDIA })

		expect(config.images?.remotePatterns).toHaveLength(1)
		expect(fetched(config, `${OTHER_MEDIA}/photo.webp`)).toBe(true)
		expect(fetched(config, `${MEDIA_ORIGIN_DEFAULT}/photo.webp`)).toBe(false)
	})

	test('a port in the media origin is part of the pattern', () => {
		expect(mediaRemotePattern('https://medias.exemple.test:8443')).toEqual({
			hostname: 'medias.exemple.test',
			pathname: '/**',
			port: '8443',
			protocol: 'https',
		})
	})
})

describe('R2_PUBLIC_URL, the media origin', () => {
	test.each([
		['missing', undefined],
		['empty', ''],
		['blank', '   '],
	])('%s: the production bucket', (_case, value) => {
		expect(mediaOrigin(value)).toBe(MEDIA_ORIGIN_DEFAULT)
	})

	test('an https origin is taken as written, with or without a port', () => {
		expect(mediaOrigin(OTHER_MEDIA)).toBe(OTHER_MEDIA)
		expect(mediaOrigin('https://medias.exemple.test:8443')).toBe('https://medias.exemple.test:8443')
	})

	test.each([
		['http', 'http://medias.exemple.test'],
		['a final slash', 'https://medias.exemple.test/'],
		['a path', 'https://medias.exemple.test/photos'],
		['a query', 'https://medias.exemple.test?v=1'],
		['a user name', 'https://temoin@medias.exemple.test'],
		['upper case', 'https://Medias.Exemple.test'],
		['the default port spelled out', 'https://medias.exemple.test:443'],
		['spaces around it', ' https://medias.exemple.test '],
		// Next reads the host of a pattern as a glob: these two would open every sub-domain, or every host.
		['a wildcard sub-domain', 'https://*.exemple.test'],
		['a wildcard host', 'https://**'],
		['a host with one label', 'https://localhost'],
		['an IPv4 address', 'https://192.168.1.20'],
		['an IPv6 address', 'https://[::1]'],
		['no scheme', 'medias.exemple.test'],
		['not an address', 'le seau des photos'],
	])('with %s: refused, and the message does not show the value', (_case, value) => {
		let refusal: unknown
		try {
			mediaOrigin(value)
		} catch (error) {
			refusal = error
		}

		expect(refusal).toBeInstanceOf(EnvError)
		const error = refusal as EnvError
		expect(error.variables).toEqual(['R2_PUBLIC_URL'])
		expect(error.message).toContain('- R2_PUBLIC_URL : refusée. Attendu : une adresse https://HÔTE')
		expect(error.message).not.toContain(value.trim())
	})

	test('a refused value stops the loading of next.config.ts: no build, no server', async () => {
		await expect(
			configUnder({ NODE_ENV: 'production', R2_PUBLIC_URL: 'https://*.exemple.test' })
		).rejects.toBeInstanceOf(EnvError)
		await expect(configUnder({ NODE_ENV: 'production', R2_PUBLIC_URL: `${OTHER_MEDIA}/` })).rejects.toBeInstanceOf(
			EnvError
		)
	})
})

describe('no client hint is asked on the public pages (issue 1033)', () => {
	// withPayload adds `Accept-CH`, `Critical-CH` and `Vary` for `Sec-CH-Prefers-Color-Scheme` to every path, for the theme
	// of the administration. A page that carries `Critical-CH` makes Chrome send the request again with the hint, once the
	// first answer is read: on a fresh visit every page of the site paid a second round trip (+144 to +338 ms in the
	// Lighthouse runs of 23/10/2026, a 307 before the real 200), and the HTML does not depend on the hint.
	const HINT_HEADERS = ['accept-ch', 'critical-ch'] as const
	const PUBLIC_PATHS = [
		'/',
		'/search',
		'/profil/ines-morel',
		'/talent/maquillage-mariee',
		'/blog/un-article',
		'/contact',
	]

	test('a public page sends neither Accept-CH nor Critical-CH, and does not vary on a hint', async () => {
		const config = await production()
		for (const pathname of PUBLIC_PATHS) {
			const sent = await headersSentFor(config, pathname)
			for (const name of HINT_HEADERS) expect([pathname, name, sent.get(name)]).toEqual([pathname, name, undefined])
			expect([pathname, (sent.get('vary') ?? '').toLowerCase().includes('sec-ch')]).toEqual([pathname, false])
		}
	})

	test('the administration keeps the hint its theme reads', async () => {
		const config = await production()
		for (const pathname of ['/admin', '/admin/collections/pros']) {
			const sent = await headersSentFor(config, pathname)
			expect(sent.get('accept-ch')).toBe('Sec-CH-Prefers-Color-Scheme')
			expect(sent.get('critical-ch')).toBe('Sec-CH-Prefers-Color-Scheme')
			expect(sent.get('vary')).toBe('Sec-CH-Prefers-Color-Scheme')
		}
	})

	test('the security headers stay on both', async () => {
		const config = await production()
		for (const pathname of ['/', '/admin']) {
			const sent = await headersSentFor(config, pathname)
			expect(sent.get('strict-transport-security')).toBe('max-age=31536000')
			expect(sent.get('x-frame-options')).toBe('SAMEORIGIN')
		}
	})
})

describe('the register of intended changes', () => {
	const register = readFileSync(path.resolve(import.meta.dir, '../../docs/migration/CHANGEMENTS-VOULUS.md'), 'utf8')
	const line = register.split('\n').find(row => row.startsWith('| `en-tetes-securite` |')) ?? ''

	test('it has the line of the security headers, with its sources', () => {
		expect(line).toContain('plan 01 §4.8')
		expect(line).toContain('ticket 034')
	})

	test('the line names each header the application sends, and no other', () => {
		const sent = securityHeaders({ development: false, mediaOrigin: MEDIA_ORIGIN_DEFAULT }).map(({ key }) => key)
		const named = [...line.matchAll(/`([A-Z][A-Za-z-]+)`/g)].map(([, name]) => name)

		expect(named).toEqual(sent)
	})
})

describe('the storage of the bench, for the image optimizer (ticket 103)', () => {
	test('nothing is opened without the variable', () => {
		expect(benchImages(undefined)).toBeNull()
		expect(benchImages('  ')).toBeNull()
	})

	test('the bench opens one local folder, over http, and the photos of it only', () => {
		const bench = benchImages('http://127.0.0.1:9110/mymakeup-test')

		expect(bench?.remotePattern).toEqual({
			hostname: '127.0.0.1',
			pathname: '/mymakeup-test/**',
			port: '9110',
			protocol: 'http',
		})
		if (!bench) throw new Error('the bench storage was refused')
		const accepted = (address: string) => hasRemoteMatch([], [bench.remotePattern], new URL(address))
		expect(accepted('http://127.0.0.1:9110/mymakeup-test/photos/une.webp')).toBe(true)
		expect(accepted('http://127.0.0.1:9110/autre-espace/une.webp')).toBe(false)
		expect(accepted('http://127.0.0.1:9111/mymakeup-test/une.webp')).toBe(false)
		expect(accepted('https://127.0.0.1:9110/mymakeup-test/une.webp')).toBe(false)
	})

	test.each([
		['a remote host', 'http://exemple.test:9090/espace'],
		['https', 'https://127.0.0.1:9090/espace'],
		['no port', 'http://127.0.0.1/espace'],
		['no bucket', 'http://127.0.0.1:9090'],
		['a deeper path', 'http://127.0.0.1:9090/espace/dossier'],
		['a final slash', 'http://127.0.0.1:9090/espace/'],
		['a wildcard', 'http://127.0.0.1:9090/*'],
		['not an address', 'espace'],
	])('%s is refused', (_cas, valeur) => {
		expect(() => benchImages(valeur)).toThrow('BENCH_IMAGES')
	})

	test('the production configuration opens nothing local', async () => {
		const { images } = await production()

		expect(images?.dangerouslyAllowLocalIP ?? false).toBe(false)
		expect(images?.remotePatterns).toHaveLength(1)
	})
})

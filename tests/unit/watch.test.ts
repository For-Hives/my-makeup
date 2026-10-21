import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
	chooseProfile,
	decide,
	failureStreak,
	fingerprint,
	healthHasVersion,
	type Message,
	parsePrevious,
	resendNotifier,
	run,
	sitemapProfiles,
} from '../../scripts/watch/watch'
import { fingerprint as probeFingerprint } from '../probes/content'

/**
 * Ticket 277: the continuous watch. The code is played against a fake site on this machine; the
 * alert goes to a recorder. Nothing leaves this machine.
 */

const ROOT = path.resolve(import.meta.dir, '../..')
const PROFILES = ['/profil/ada-lovelace-paris', '/profil/grace-hopper-lyon', '/profil/zoe-test-nice']
const USER = 'acces-user-xyz'
const PASSWORD = 'acces-mdp-xyz'

type Mode = 'ok' | 'down' | 'noVersion' | 'slow' | 'noProfiles'
let mode: Mode = 'ok'
const requests: { method: string; path: string; authorization: string | null }[] = []
let fake: ReturnType<typeof Bun.serve>

beforeAll(() => {
	fake = Bun.serve({
		port: 0,
		hostname: '127.0.0.1',
		async fetch(request) {
			const { pathname } = new URL(request.url)
			requests.push({ method: request.method, path: pathname, authorization: request.headers.get('authorization') })
			if (mode === 'down') return new Response('{"ok":false}', { status: 503 })
			if (mode === 'slow') {
				await Bun.sleep(400)
				return new Response('lent')
			}
			if (pathname === '/api/health')
				return new Response(mode === 'noVersion' ? '{"ok":true}' : '{"ok":true,"version":"abc1234"}')
			if (pathname === '/sitemap.xml') {
				const locs = mode === 'noProfiles' ? [] : PROFILES
				return new Response(
					`<urlset><url><loc>https://my-makeup.fr/</loc></url>${locs
						.map(profile => `<url><loc>https://my-makeup.fr${profile}</loc></url>`)
						.join('')}</urlset>`
				)
			}
			return new Response('<h1>page</h1>')
		},
	})
})
afterAll(async () => {
	await fake.stop(true)
})

const TARGET = () => `http://127.0.0.1:${fake.port}`

/** Plays successive runs like the workflow: each run gets the conclusions of the earlier ones. */
function player(extraEnv: Record<string, string> = {}) {
	const history: ('success' | 'failure')[] = []
	const messages: Message[] = []
	const logs: string[] = []
	return {
		messages,
		logs,
		async next(nextMode: Mode, slowAfterMs?: number): Promise<number> {
			mode = nextMode
			const code = await run({
				env: { WATCH_TARGET: TARGET(), WATCH_PREVIOUS: history.join(','), ...extraEnv },
				notify: async message => {
					messages.push(message)
				},
				log: line => logs.push(line),
				...(slowAfterMs === undefined ? {} : { slowAfterMs }),
			})
			history.unshift(code === 0 ? 'success' : 'failure')
			return code
		},
	}
}

describe('the decision', () => {
	test('counts the failures at the head of the previous conclusions, newest first', () => {
		expect(failureStreak([])).toBe(0)
		expect(failureStreak(['failure', 'failure', 'success', 'failure'])).toBe(2)
		expect(parsePrevious('failure,cancelled,success, failure,')).toEqual(['failure', 'success', 'failure'])
		expect(parsePrevious(undefined)).toEqual([])
	})

	test.each([
		[[], true, 'none'],
		[['success'], false, 'none'],
		[['failure', 'success'], false, 'alert'],
		[['failure', 'failure', 'success'], false, 'none'],
		[['failure'], true, 'none'],
		[['failure', 'failure'], true, 'recovery'],
		[['failure', 'failure', 'failure'], true, 'recovery'],
	] as const)('previous %j, ok %p gives %s', (previous, ok, action) => {
		expect(decide(previous, ok).action).toBe(action)
	})
})

describe('the reads', () => {
	test('200 then 503 twice: exactly one alert, and the return to 200 one message of end', async () => {
		const play = player()
		expect(await play.next('ok')).toBe(0)
		expect(await play.next('down')).toBe(1)
		expect(play.messages).toHaveLength(0)
		expect(await play.next('down')).toBe(1)
		expect(play.messages).toHaveLength(1)
		expect(play.messages[0]?.subject).toContain('ne répond plus')
		expect(await play.next('down')).toBe(1)
		expect(play.messages).toHaveLength(1)
		expect(await play.next('ok')).toBe(0)
		expect(play.messages).toHaveLength(2)
		expect(play.messages[1]?.subject).toContain('répond de nouveau')
		expect(await play.next('ok')).toBe(0)
		expect(play.messages).toHaveLength(2)
	})

	test('a failure followed by a success sends nothing', async () => {
		const play = player()
		await play.next('down')
		expect(await play.next('ok')).toBe(0)
		expect(play.messages).toHaveLength(0)
	})

	test('reads the health, the home page and one profile, with GET only', async () => {
		requests.length = 0
		expect(await player().next('ok')).toBe(0)
		expect(requests.every(request => request.method === 'GET')).toBe(true)
		expect(requests.slice(0, 3).map(request => request.path)).toEqual(['/api/health', '/', '/sitemap.xml'])
		expect(PROFILES).toContain(requests[3]?.path ?? '')
		expect(requests).toHaveLength(4)
	})

	test('a health answer without its version is a failure', async () => {
		expect(await player().next('noVersion')).toBe(1)
		expect(healthHasVersion('{"ok":true}')).toBe(false)
		expect(healthHasVersion('{"ok":true,"version":"unknown"}')).toBe(false)
		expect(healthHasVersion('nope')).toBe(false)
		expect(healthHasVersion('{"ok":true,"version":"abc1234"}')).toBe(true)
	})

	test('an answer later than the limit is a failure', async () => {
		const play = player()
		expect(await play.next('slow', 100)).toBe(1)
		expect(play.logs.join('\n')).toContain('délai dépassé')
	})

	test('a redirect is a failure: it is never followed', async () => {
		const redirecting = Bun.serve({
			port: 0,
			hostname: '127.0.0.1',
			fetch: () => new Response(null, { status: 301, headers: { location: 'https://example.invalid/' } }),
		})
		try {
			const logs: string[] = []
			const code = await run({
				env: { WATCH_TARGET: `http://127.0.0.1:${redirecting.port}` },
				log: line => logs.push(line),
			})
			expect(code).toBe(1)
			expect(logs.join('\n')).toContain('statut 301')
		} finally {
			await redirecting.stop(true)
		}
	})

	test('a site without any profile yet is not a failure', async () => {
		expect(await player().next('noProfiles')).toBe(0)
	})

	test('an unreachable host is a failure, without writing its address', async () => {
		const logs: string[] = []
		const code = await run({
			env: { WATCH_TARGET: 'http://127.0.0.1:1' },
			log: line => logs.push(line),
		})
		expect(code).toBe(1)
		expect(logs.join('\n')).toContain('erreur réseau')
	})
})

describe('the target', () => {
	test.each([
		['missing', undefined],
		['with a path', 'https://my-makeup.fr/profil'],
		['in plain http on a real host', 'http://my-makeup.fr'],
		['with identifiers', 'https://user:pass@my-makeup.fr'],
	])('a target %s is refused: exit 2, nothing sent', async (_name, value) => {
		const sent: string[] = []
		const code = await run({
			env: { ...(value ? { WATCH_TARGET: value } : {}) },
			fetch: (async (url: string | URL | Request) => {
				sent.push(String(url))
				return new Response('')
			}) as typeof fetch,
			log: () => undefined,
		})
		expect(code).toBe(2)
		expect(sent).toEqual([])
	})
})

describe('what the logs and the messages hold', () => {
	test('the profile is a fingerprint of 8 characters, never its address, and no identifier of the access appears', async () => {
		const play = player({ WATCH_ACCESS_USER: USER, WATCH_ACCESS_PASSWORD: PASSWORD })
		requests.length = 0
		await play.next('ok')
		await play.next('down')
		await play.next('down')
		const everything = [...play.logs, ...play.messages.flatMap(message => [message.subject, message.text])].join('\n')
		for (const forbidden of [
			...PROFILES,
			...PROFILES.map(profile => profile.replace('/profil/', '')),
			USER,
			PASSWORD,
			Buffer.from(`${USER}:${PASSWORD}`).toString('base64'),
		])
			expect(everything).not.toContain(forbidden)
		mode = 'ok'
		const logs: string[] = []
		await run({ env: { WATCH_TARGET: TARGET() }, log: line => logs.push(line) })
		const chosen = chooseProfile(PROFILES) ?? ''
		expect(logs.join('\n')).toMatch(/profil #[0-9a-f]{8} /)
		expect(logs.join('\n')).toContain(`#${probeFingerprint(chosen)}`)
	})

	test('the protected access is sent when both identifiers are set, and only then', async () => {
		requests.length = 0
		await player({ WATCH_ACCESS_USER: USER, WATCH_ACCESS_PASSWORD: PASSWORD }).next('ok')
		const expected = `Basic ${Buffer.from(`${USER}:${PASSWORD}`).toString('base64')}`
		expect(requests.length).toBeGreaterThan(0)
		expect(requests.every(request => request.authorization === expected)).toBe(true)
		requests.length = 0
		await player({ WATCH_ACCESS_USER: USER }).next('ok')
		expect(requests.every(request => request.authorization === null)).toBe(true)
	})

	test('the alert names the failing checks and the run, in French', async () => {
		const messages: Message[] = []
		mode = 'down'
		await run({
			env: {
				WATCH_TARGET: TARGET(),
				WATCH_PREVIOUS: 'failure,success',
				GITHUB_SERVER_URL: 'https://github.com',
				GITHUB_REPOSITORY: 'For-Hives/my-makeup',
				GITHUB_RUN_ID: '42',
			},
			notify: async message => {
				messages.push(message)
			},
			log: () => undefined,
		})
		expect(messages[0]?.text).toContain('- santé : statut 503')
		expect(messages[0]?.text).toContain('https://github.com/For-Hives/my-makeup/actions/runs/42')
	})

	test('an alert that cannot be sent fails the run; a message of end that cannot be sent does not', async () => {
		const broken: (message: Message) => Promise<void> = async () => {
			throw new Error('boom')
		}
		mode = 'down'
		expect(
			await run({
				env: { WATCH_TARGET: TARGET(), WATCH_PREVIOUS: 'failure,success' },
				notify: broken,
				log: () => undefined,
			})
		).toBe(1)
		mode = 'ok'
		expect(
			await run({
				env: { WATCH_TARGET: TARGET(), WATCH_PREVIOUS: 'failure,failure' },
				notify: broken,
				log: () => undefined,
			})
		).toBe(0)
		// No channel set at all: the alert is lost loudly, not silently.
		mode = 'down'
		const logs: string[] = []
		expect(
			await run({ env: { WATCH_TARGET: TARGET(), WATCH_PREVIOUS: 'failure,success' }, log: line => logs.push(line) })
		).toBe(1)
		expect(logs.join('\n')).toContain('ALERTE NON ENVOYÉE')
	})
})

describe('the helpers', () => {
	test('the fingerprint is the one of the weekly probes', () => {
		expect(fingerprint('/profil/x')).toBe(probeFingerprint('/profil/x'))
		expect(fingerprint('/profil/x')).toMatch(/^[0-9a-f]{8}$/)
	})

	test('reads the profile paths of a sitemap, once each', () => {
		const xml = `<loc>https://my-makeup.fr/</loc><loc>https://my-makeup.fr/profil/a</loc><loc>https://my-makeup.fr/profil/a</loc><loc>https://my-makeup.fr/profil/b/c</loc><loc>https://my-makeup.fr/blog/x</loc>`
		expect(sitemapProfiles(xml)).toEqual(['/profil/a'])
		expect(chooseProfile([])).toBeUndefined()
	})

	test('the email goes to the service with the key in the header and the text in the body', async () => {
		const calls: { url: string; init: RequestInit }[] = []
		const send = resendNotifier({ key: 'cle', to: 'a@example.test', from: 'b@example.test' }, (async (
			url: string | URL | Request,
			init?: RequestInit
		) => {
			calls.push({ url: String(url), init: init ?? {} })
			return new Response('{}', { status: 200 })
		}) as typeof fetch)
		await send({ subject: 's', text: 't' })
		expect(calls[0]?.url).toBe('https://api.resend.com/emails')
		expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
			from: 'b@example.test',
			to: ['a@example.test'],
			subject: 's',
			text: 't',
		})
		const failing = resendNotifier(
			{ key: 'k', to: 'a@example.test', from: 'b@example.test' },
			(async () => new Response('', { status: 422 })) as unknown as typeof fetch
		)
		await expect(failing({ subject: 's', text: 't' })).rejects.toThrow('422')
	})
})

describe('the workflow', () => {
	const text = readFileSync(path.join(ROOT, '.github/workflows/sonde-continue.yml'), 'utf8')
	const workflow = Bun.YAML.parse(text) as {
		on: { schedule: { cron: string }[]; workflow_dispatch: unknown }
		permissions: Record<string, string>
	}
	const code = text
		.split('\n')
		.filter(line => !line.trimStart().startsWith('#'))
		.join('\n')

	test('it runs every 5 minutes, can be started by hand, and only reads the repository and its runs', () => {
		expect(workflow.on.schedule).toEqual([{ cron: '*/5 * * * *' }])
		expect(workflow.on.workflow_dispatch).toBeDefined()
		expect(workflow.permissions).toEqual({ contents: 'read', actions: 'read' })
	})

	test('the target is a repository variable and no input; no step tolerates a failure', () => {
		expect(code).toMatch(/WATCH_TARGET: \$\{\{ vars\.WATCH_TARGET \}\}/)
		expect(code).not.toMatch(/\$\{\{\s*(inputs|github\.event\.inputs)/)
		expect(code).not.toMatch(/continue-on-error|\|\|\s*(true|:)|set \+e/)
		expect(code).toContain('bun run watch:site')
	})
})

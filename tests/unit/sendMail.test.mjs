// /api/sendMail (src/pages/api/sendMail.js) end to end with a fake Resend
// (fetch) and a fake Mailgun: no request leaves the test.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
	CONTACT_SUBJECT,
	contactProvider,
	contactText,
	sendMailHandler,
} from '../../src/lib/contactMail.js'
import { RESEND_EMAILS_URL } from '../../src/lib/resend.js'

const CLE_RESEND = 're_cle_resend_factice'
const CLE_MAILGUN = 'cle-mailgun-factice'
const RESEND = { RESEND_API_KEY: CLE_RESEND }
const MAILGUN = {
	MAILGUN_API_KEY: CLE_MAILGUN,
	MAILGUN_DOMAIN: 'mg.example.test',
}

const message = {
	first_name: 'Testine',
	last_name: 'Recette',
	email: 'testine.recette@example.test',
	phone_number: '0100000000',
	message: 'Bonjour, un message de recette',
}

function fauxRes() {
	return {
		statusCode: 0,
		body: undefined,
		status(code) {
			this.statusCode = code
			return this
		},
		json(body) {
			this.body = body
			return this
		},
	}
}

// fake Resend: records the calls, answers with the given status
function fauxResend(status = 200) {
	const appels = []
	const fetchImpl = async (url, init) => {
		appels.push({ url, init })
		return new Response(
			JSON.stringify(
				status < 300
					? { id: 'id-factice' }
					: { statusCode: status, name: 'error', message: CLE_RESEND }
			),
			{ status, headers: { 'content-type': 'application/json' } }
		)
	}
	return { appels, fetchImpl }
}

// fake Mailgun: records the calls, throws the given error
function fauxMailgun(erreur) {
	const appels = []
	const sendWithMailgun = async (domain, data) => {
		appels.push({ domain, data })
		if (erreur) throw erreur
		return { id: 'id-factice', status: 200 }
	}
	return { appels, sendWithMailgun }
}

// every console line of the test, restored afterwards
function journaux(t) {
	const lignes = []
	for (const niveau of ['log', 'info', 'warn', 'error'])
		t.mock.method(console, niveau, (...args) => lignes.push([niveau, ...args]))
	return lignes
}

async function envoyer(handler, body = message, method = 'POST') {
	const res = fauxRes()
	await handler({ method, body }, res)
	return res
}

function monter({ env, status, erreurMailgun, fetchImpl, timeoutMs } = {}) {
	const resend = fauxResend(status)
	const mailgun = fauxMailgun(erreurMailgun)
	const handler = sendMailHandler({
		env,
		fetchImpl: fetchImpl ?? resend.fetchImpl,
		sendWithMailgun: mailgun.sendWithMailgun,
		timeoutMs,
	})
	return { handler, resend: resend.appels, mailgun: mailgun.appels }
}

// what a log line must never contain: a key or anything the visitor typed
function verifierJournaux(lignes) {
	const texte = JSON.stringify(lignes)
	for (const secret of [CLE_RESEND, CLE_MAILGUN, ...Object.values(message)])
		assert.equal(texte.includes(secret), false, `${secret} dans les journaux`)
}

describe('contactProvider', () => {
	test('Resend wins, then Mailgun with its key and domain, else nothing', () => {
		assert.equal(contactProvider({ ...MAILGUN, ...RESEND }), 'resend')
		assert.equal(contactProvider(RESEND), 'resend')
		assert.equal(contactProvider(MAILGUN), 'mailgun')
		assert.equal(contactProvider({ MAILGUN_API_KEY: CLE_MAILGUN }), null)
		assert.equal(contactProvider({ RESEND_API_KEY: '  ' }), null)
		assert.equal(contactProvider({ ...MAILGUN, RESEND_API_KEY: '' }), 'mailgun')
		assert.equal(contactProvider({}), null)
	})
})

describe('/api/sendMail through Resend', () => {
	test('sent: POST /emails, bearer key, default sender and recipient, Reply-To the visitor', async t => {
		const lignes = journaux(t)
		const { handler, resend, mailgun } = monter({ env: { ...RESEND } })
		const res = await envoyer(handler, {
			...message,
			email: `  ${message.email} `,
		})

		assert.equal(res.statusCode, 200)
		assert.deepEqual(res.body, { success: true })
		assert.equal(resend.length, 1)
		assert.equal(mailgun.length, 0)

		const { url, init } = resend[0]
		assert.equal(url, RESEND_EMAILS_URL)
		assert.equal(url, 'https://api.resend.com/emails')
		assert.equal(init.method, 'POST')
		assert.equal(init.headers.Authorization, `Bearer ${CLE_RESEND}`)
		assert.equal(init.headers['Content-Type'], 'application/json')
		assert.ok(init.signal instanceof AbortSignal)
		assert.deepEqual(JSON.parse(init.body), {
			from: 'My Makeup <contact@send.my-makeup.fr>',
			to: 'contact@my-makeup.fr',
			reply_to: message.email,
			subject: CONTACT_SUBJECT,
			text: contactText(message),
		})

		assert.deepEqual(lignes, [
			['info', '[sendMail] provider=resend sent', { status: 200 }],
		])
		verifierJournaux(lignes)
	})

	test('EMAIL_FROM and CONTACT_TO replace the defaults; blank keeps them', async t => {
		journaux(t)
		const avec = monter({
			env: {
				...RESEND,
				EMAIL_FROM: ' Équipe <equipe@send.example.test> ',
				CONTACT_TO: 'boite@example.test',
			},
		})
		await envoyer(avec.handler)
		const corps = JSON.parse(avec.resend[0].init.body)
		assert.equal(corps.from, 'Équipe <equipe@send.example.test>')
		assert.equal(corps.to, 'boite@example.test')

		const vides = monter({
			env: { ...RESEND, EMAIL_FROM: ' ', CONTACT_TO: '' },
		})
		await envoyer(vides.handler)
		const defaut = JSON.parse(vides.resend[0].init.body)
		assert.equal(defaut.from, 'My Makeup <contact@send.my-makeup.fr>')
		assert.equal(defaut.to, 'contact@my-makeup.fr')
	})

	test('the key is trimmed', async t => {
		journaux(t)
		const { handler, resend } = monter({
			env: { RESEND_API_KEY: ` ${CLE_RESEND}\n` },
		})
		await envoyer(handler)
		assert.equal(resend[0].init.headers.Authorization, `Bearer ${CLE_RESEND}`)
	})

	test('Resend wins over Mailgun when both are configured', async t => {
		journaux(t)
		const { handler, resend, mailgun } = monter({
			env: { ...MAILGUN, ...RESEND },
		})
		const res = await envoyer(handler)
		assert.equal(res.statusCode, 200)
		assert.equal(resend.length, 1)
		assert.equal(mailgun.length, 0)
	})

	test('Resend answers 4xx or 5xx: a clean 502, the status in the logs, no Mailgun fallback', async t => {
		const lignes = journaux(t)
		for (const status of [400, 401, 403, 422, 429, 500, 502, 503]) {
			const debut = lignes.length
			const { handler, resend, mailgun } = monter({
				env: { ...MAILGUN, ...RESEND },
				status,
			})
			const res = await envoyer(handler)
			assert.equal(res.statusCode, 502, String(status))
			assert.deepEqual(res.body, { success: false })
			assert.equal(resend.length, 1)
			assert.equal(mailgun.length, 0)
			assert.deepEqual(lignes.slice(debut), [
				[
					'error',
					'[sendMail] provider=resend failed',
					{ kind: 'http', status },
				],
			])
		}
		verifierJournaux(lignes)
	})

	test('no answer within the delay: a clean 502, kind timeout', async t => {
		const lignes = journaux(t)
		const muet = (url, init) =>
			new Promise((resolve, reject) =>
				init.signal.addEventListener('abort', () => reject(init.signal.reason))
			)
		const { handler } = monter({ env: RESEND, fetchImpl: muet, timeoutMs: 50 })
		const res = await envoyer(handler)
		assert.equal(res.statusCode, 502)
		assert.deepEqual(res.body, { success: false })
		assert.deepEqual(lignes, [
			[
				'error',
				'[sendMail] provider=resend failed',
				{ kind: 'timeout', status: 0 },
			],
		])
	})

	test('network down: a clean 502, kind network', async t => {
		const lignes = journaux(t)
		const enPanne = async () => {
			throw new TypeError(`fetch failed ${CLE_RESEND} ${message.email}`)
		}
		const { handler } = monter({ env: RESEND, fetchImpl: enPanne })
		const res = await envoyer(handler)
		assert.equal(res.statusCode, 502)
		assert.deepEqual(lignes, [
			[
				'error',
				'[sendMail] provider=resend failed',
				{ kind: 'network', status: 0 },
			],
		])
		verifierJournaux(lignes)
	})

	test('an invalid message is refused with 400 and nothing is sent', async t => {
		const lignes = journaux(t)
		const { handler, resend, mailgun } = monter({
			env: { ...MAILGUN, ...RESEND },
		})
		const refuses = [
			[{ ...message, message: '   ' }, 'message'],
			[{ ...message, first_name: undefined }, 'first_name'],
			[{ ...message, phone_number: '1'.repeat(31) }, 'phone_number'],
			[{ ...message, email: 'sans-arobase' }, 'email'],
			// would be a name, a list or a group as Reply-To
			[{ ...message, email: 'Eve <eve@example.test>' }, 'email'],
			[{ ...message, email: '<eve@example.test>' }, 'email'],
			[{ ...message, email: 'eve@example.test,autre@example.test' }, 'email'],
			[{ ...message, email: 'a,b@example.test' }, 'email'],
			[{ ...message, email: '"eve"@example.test' }, 'email'],
			[{ ...message, email: 'eve@example.test;x' }, 'email'],
			[
				{ ...message, email: 'eve@example.test\r\nBcc: x@example.test' },
				'email',
			],
			[null, 'first_name'],
		]
		for (const [body, field] of refuses) {
			const res = await envoyer(handler, body)
			assert.equal(res.statusCode, 400, JSON.stringify(body))
			assert.deepEqual(res.body, { success: false })
			assert.deepEqual(lignes.at(-1), [
				'warn',
				'[sendMail] rejected',
				{ field },
			])
		}
		assert.equal(resend.length, 0)
		assert.equal(mailgun.length, 0)
		verifierJournaux(lignes)
	})

	test('a plain address with + . - _ is accepted', async t => {
		journaux(t)
		const { handler, resend } = monter({ env: RESEND })
		const res = await envoyer(handler, {
			...message,
			email: 'prenom.nom+contact_1-x@sous.example.test',
		})
		assert.equal(res.statusCode, 200)
		assert.equal(
			JSON.parse(resend[0].init.body).reply_to,
			'prenom.nom+contact_1-x@sous.example.test'
		)
	})
})

describe('/api/sendMail through Mailgun (no RESEND_API_KEY, unchanged)', () => {
	test('same sender, recipient, subject and text as before', async t => {
		const lignes = journaux(t)
		const { handler, resend, mailgun } = monter({
			env: { ...MAILGUN, RESEND_API_KEY: '' },
		})
		const res = await envoyer(handler)
		assert.equal(res.statusCode, 200)
		assert.deepEqual(res.body, { success: true })
		assert.equal(resend.length, 0)
		const s16 = ' '.repeat(16)
		assert.deepEqual(mailgun, [
			{
				domain: 'mg.example.test',
				data: {
					from: 'My-Makeup <contact@my-makeup.fr>',
					to: 'contact@my-makeup.fr',
					subject: 'Nouveau message de contact',
					text: [
						'',
						`${s16}Nom: Recette \n`,
						`${s16}Prénom: Testine \n`,
						`${s16}Email: testine.recette@example.test \n`,
						`${s16}Numéro de téléphone: 0100000000 \n`,
						`${s16}Message: Bonjour, un message de recette`,
						' '.repeat(12),
					].join('\n'),
				},
			},
		])
		assert.deepEqual(lignes, [['info', '[sendMail] sent']])
	})

	test('a Mailgun failure is a 502 with its kind and status', async t => {
		const lignes = journaux(t)
		const { handler } = monter({
			env: MAILGUN,
			erreurMailgun: {
				status: 401,
				message: 'Unauthorized',
				details: `Forbidden ${CLE_MAILGUN}`,
			},
		})
		const res = await envoyer(handler)
		assert.equal(res.statusCode, 502)
		assert.deepEqual(lignes, [
			['error', '[sendMail] failed', { kind: 'http', status: 401 }],
		])
		verifierJournaux(lignes)
	})
})

describe('/api/sendMail without a provider or with another method', () => {
	test('not configured: 503 before reading the message, nothing sent', async t => {
		const lignes = journaux(t)
		for (const env of [
			{},
			{ RESEND_API_KEY: ' ' },
			{ MAILGUN_API_KEY: CLE_MAILGUN },
			{ MAILGUN_DOMAIN: 'mg.example.test' },
		]) {
			const { handler, resend, mailgun } = monter({ env })
			const res = await envoyer(handler)
			assert.equal(res.statusCode, 503, JSON.stringify(env))
			assert.deepEqual(res.body, { success: false })
			assert.equal(resend.length + mailgun.length, 0)
		}
		assert.deepEqual(
			lignes,
			Array(4).fill(['error', '[sendMail] not configured'])
		)
	})

	test('GET: 405, nothing sent', async t => {
		journaux(t)
		const { handler, resend, mailgun } = monter({ env: RESEND })
		const res = await envoyer(handler, undefined, 'GET')
		assert.equal(res.statusCode, 405)
		assert.equal(resend.length + mailgun.length, 0)
	})

	test('the environment is read on each request', async t => {
		journaux(t)
		const env = {}
		const { handler, resend } = monter({ env })
		assert.equal((await envoyer(handler)).statusCode, 503)
		env.RESEND_API_KEY = CLE_RESEND
		assert.equal((await envoyer(handler)).statusCode, 200)
		assert.equal(resend.length, 1)
	})
})

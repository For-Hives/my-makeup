import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { contactMessage, MAILGUN_EU_URL, mailgunClientOptions, mailgunErrorSummary } from '../../src/lib/mailgun.js'

describe('mailgunClientOptions', () => {
	test('keeps the library default (US) without MAILGUN_REGION', () => {
		assert.deepEqual(mailgunClientOptions({ key: 'k' }), {
			username: 'api',
			key: 'k',
		})
		assert.deepEqual(mailgunClientOptions({ key: 'k', region: 'us' }), {
			username: 'api',
			key: 'k',
		})
	})

	test('uses the EU endpoint with MAILGUN_REGION=eu', () => {
		assert.deepEqual(mailgunClientOptions({ key: 'k', region: ' EU ' }), {
			username: 'api',
			key: 'k',
			url: MAILGUN_EU_URL,
		})
	})
})

describe('contactMessage', () => {
	const valid = {
		first_name: 'Testine',
		last_name: 'Recette',
		email: 'testine@example.test',
		phone_number: '0000',
		message: 'Bonjour',
	}

	test('accepts a complete message and ignores unknown fields', () => {
		const result = contactMessage({ ...valid, extra: 'x' })
		assert.equal(result.ok, true)
		assert.deepEqual(Object.keys(result.fields).sort(), Object.keys(valid).sort())
	})

	test('rejects missing, empty, oversized or malformed fields', () => {
		assert.deepEqual(contactMessage({ ...valid, message: '  ' }), {
			ok: false,
			field: 'message',
		})
		assert.deepEqual(contactMessage({ ...valid, email: 'no-at' }), {
			ok: false,
			field: 'email',
		})
		assert.deepEqual(contactMessage({ ...valid, message: 'x'.repeat(5001) }), {
			ok: false,
			field: 'message',
		})
		assert.equal(contactMessage(null).ok, false)
		assert.equal(contactMessage('text').ok, false)
	})

	test('the email is one bare address (it becomes the Reply-To)', () => {
		for (const email of [
			'Testine <testine@example.test>',
			'testine@example.test, autre@example.test',
			'a;b@example.test',
			'"testine"@example.test',
			'testine@[127.0.0.1]',
			'testine(x)@example.test',
			'a@b@example.test',
		]) {
			assert.deepEqual(contactMessage({ ...valid, email }), { ok: false, field: 'email' }, email)
		}
		for (const email of ['testine@example.test', 'prenom.nom+tag_1-x@sous.example.test', "o'neil@example.test"]) {
			assert.equal(contactMessage({ ...valid, email }).ok, true, email)
		}
	})
})

describe('mailgunErrorSummary', () => {
	test('keeps the kind and the status of an HTTP answer, never the text', () => {
		const error = {
			status: 401,
			details: 'Forbidden for a@b.fr',
			message: 'Unauthorized',
		}
		assert.deepEqual(mailgunErrorSummary(error), { kind: 'http', status: 401 })
		// a real 400 from Mailgun: its body message, no system code
		assert.deepEqual(
			mailgunErrorSummary({
				status: 400,
				statusText: 'Bad Request',
				message: 'Bad Request',
				details: "'to' parameter is not a valid address",
				type: 'MailgunAPIError',
			}),
			{ kind: 'http', status: 400 }
		)
	})

	test('tells a request without HTTP response from a Mailgun 400', () => {
		// what mailgun.js 11 throws when the network is down: status 400,
		// the axios code as message, the system error as details
		for (const [code, details] of [
			['EAI_AGAIN', 'getaddrinfo EAI_AGAIN api.mailgun.net'],
			['ENOTFOUND', 'getaddrinfo ENOTFOUND api.eu.mailgun.net'],
			['ECONNREFUSED', 'connect ECONNREFUSED 127.0.0.1:443'],
			['ECONNABORTED', 'timeout of 60000ms exceeded'],
			['ERR_NETWORK', 'Network Error'],
		]) {
			assert.deepEqual(
				mailgunErrorSummary({
					status: 400,
					statusText: code,
					message: code,
					details,
					type: 'MailgunAPIError',
				}),
				{ kind: 'network', status: 0 },
				code
			)
		}
		assert.deepEqual(mailgunErrorSummary(Object.assign(new Error('x'), { code: 'ETIMEDOUT' })), {
			kind: 'network',
			status: 0,
		})
	})

	test('never returns more than the kind and the status', () => {
		assert.deepEqual(mailgunErrorSummary(new Error('boom a@b.fr')), {
			kind: 'unknown',
			status: 0,
		})
		assert.deepEqual(mailgunErrorSummary(undefined), {
			kind: 'unknown',
			status: 0,
		})
		assert.deepEqual(mailgunErrorSummary({ status: 'x' }), {
			kind: 'unknown',
			status: 0,
		})
	})
})

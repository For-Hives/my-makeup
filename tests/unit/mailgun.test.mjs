import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
	MAILGUN_EU_URL,
	contactMessage,
	mailgunClientOptions,
	mailgunErrorSummary,
} from '../../src/lib/mailgun.js'

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
		assert.deepEqual(
			Object.keys(result.fields).sort(),
			Object.keys(valid).sort()
		)
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
})

describe('mailgunErrorSummary', () => {
	test('keeps the status only', () => {
		const error = {
			status: 401,
			details: 'Forbidden for a@b.fr',
			message: 'Unauthorized',
		}
		assert.deepEqual(mailgunErrorSummary(error), { status: 401 })
		assert.deepEqual(mailgunErrorSummary(new Error('network')), { status: 0 })
		assert.deepEqual(mailgunErrorSummary(undefined), { status: 0 })
	})
})

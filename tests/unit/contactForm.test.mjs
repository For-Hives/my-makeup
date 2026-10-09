import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { contactFormSchema } from '../../src/lib/contactForm.js'
import { CONTACT_LIMITS, contactMessage } from '../../src/lib/mailgun.js'

const valid = {
	first_name: 'Camille',
	last_name: 'Test',
	email: 'camille@example.test',
	phone_number: '0100000000',
	message: 'Bonjour',
}

// error messages of a failed parse, by field
function errorsOf(input) {
	const result = contactFormSchema.safeParse(input)
	assert.equal(result.success, false)
	return result.error.flatten().fieldErrors
}

describe('contactFormSchema', () => {
	test('accepts a normal message, which the server accepts too', () => {
		const result = contactFormSchema.safeParse(valid)
		assert.equal(result.success, true)
		assert.equal(contactMessage(result.data).ok, true)
	})

	test('stops a message over 5000 characters with a field error', () => {
		const errors = errorsOf({ ...valid, message: 'a'.repeat(5001) })
		assert.deepEqual(Object.keys(errors), ['message'])
		assert.deepEqual(errors.message, ['Le message ne doit pas dépasser 5000 caractères'])
	})

	test('every limit matches the server: max passes both, max + 1 fails in the form', () => {
		for (const [name, max] of Object.entries(CONTACT_LIMITS)) {
			const fill = n => (name === 'email' ? `${'a'.repeat(n - '@example.test'.length)}@example.test` : 'a'.repeat(n))

			const atMax = contactFormSchema.safeParse({ ...valid, [name]: fill(max) })
			assert.equal(atMax.success, true, `${name} at ${max}`)
			assert.equal(contactMessage(atMax.data).ok, true, `${name} at ${max}`)

			const over = { ...valid, [name]: fill(max + 1) }
			assert.equal(contactMessage(over).ok, false, `${name} at ${max + 1}`)
			assert.ok(errorsOf(over)[name], `${name} at ${max + 1}`)
		}
	})

	test('counts the length after trimming, as the server does', () => {
		const padded = { ...valid, message: `  ${'a'.repeat(5000)}  ` }
		const result = contactFormSchema.safeParse(padded)
		assert.equal(result.success, true)
		assert.equal(result.data.message.length, 5000)
		assert.equal(contactMessage(padded).ok, true)
	})

	test('refuses blank fields, which the server would refuse', () => {
		for (const name of Object.keys(CONTACT_LIMITS)) {
			const blank = { ...valid, [name]: '   ' }
			assert.equal(contactMessage(blank).ok, false, name)
			assert.ok(errorsOf(blank)[name], name)
		}
		assert.deepEqual(errorsOf({ ...valid, message: '' }).message, ['Le message est requis'])
	})
})

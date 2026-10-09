import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EDITEUR, formatSiren, formatSiret, HEBERGEUR, luhnValid } from '../../src/lib/legal.js'

test('SIREN and SIRET of the publisher are consistent and pass the Luhn check', () => {
	assert.match(EDITEUR.siren, /^\d{9}$/)
	assert.match(EDITEUR.siret, /^\d{14}$/)
	assert.ok(EDITEUR.siret.startsWith(EDITEUR.siren))
	assert.ok(luhnValid(EDITEUR.siren))
	assert.ok(luhnValid(EDITEUR.siret))
})

test('the closed Nantes establishment is not used any more', () => {
	assert.notEqual(EDITEUR.siret, '88050527600019')
	assert.doesNotMatch(EDITEUR.adresse, /Nantes/i)
})

test('luhnValid rejects a typo', () => {
	assert.equal(luhnValid('88050527600036'), false)
	assert.equal(luhnValid('abc'), false)
})

test('formatSiren and formatSiret', () => {
	assert.equal(formatSiren('123456789'), '123 456 789')
	assert.equal(formatSiret('12345678900011'), '123 456 789 00011')
})

test('host is named with an address', () => {
	assert.equal(HEBERGEUR.nom, 'netcup GmbH')
	assert.match(HEBERGEUR.adresse, /Karlsruhe/)
})

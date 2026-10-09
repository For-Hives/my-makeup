import assert from 'node:assert/strict'
import { test } from 'node:test'
import { avecCles } from '../../src/lib/cles.js'

test('reordering items preserves their React identity', () => {
	const avant = avecCles(['Mariage', 'Cinéma'])
	const apres = avecCles(['Cinéma', 'Mariage'])
	assert.equal(avant[0].cle, apres[1].cle)
	assert.equal(avant[1].cle, apres[0].cle)
})

test('repeated lines receive distinct keys without dropping content', () => {
	const lignes = ['Texte', 'Texte', 'Autre texte']
	const resultats = avecCles(lignes)
	assert.deepEqual(
		resultats.map(item => item.valeur),
		lignes
	)
	assert.equal(new Set(resultats.map(item => item.cle)).size, lignes.length)
})

test('editing an API item preserves the key of its persisted id', () => {
	const [avant] = avecCles([{ id: 12, name: 'Avant' }])
	const [apres] = avecCles([{ id: 12, name: 'Après' }])
	assert.equal(avant.cle, apres.cle)
})

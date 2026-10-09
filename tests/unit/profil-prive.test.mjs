import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CHAMPS_PROFIL, filtrerProfilPrive } from '../../src/lib/profil-prive.js'

// shape of GET /api/me-makeup before URG-06 (populate user: '*'), fake values
const brut = {
	id: 10,
	username: 'marie',
	first_name: 'Marie',
	city: 'Annecy',
	available: null,
	pro: true,
	score: 4,
	skills: [{ id: 1, name: 'Mariée' }],
	network: { id: 1, instagram: null },
	main_picture: {
		id: 3,
		url: 'https://r2.example.test/a.webp',
		createdBy: { id: 1, password: '$2a$10$faux', resetPasswordToken: 'x' },
		updatedBy: { id: 1 },
	},
	image_gallery: [{ id: 4, url: 'https://r2.example.test/b.webp', createdBy: { id: 1 } }],
	user: {
		id: 7,
		username: 'marie',
		email: 'marie@test.local',
		password: '$2a$10$faux',
		resetPasswordToken: 'faux',
		confirmationToken: 'faux',
		provider: 'local',
		role: { id: 1 },
	},
}

test('keeps the profile fields the page and its modals use', () => {
	const profil = filtrerProfilPrive(brut)
	assert.equal(profil.id, 10)
	assert.equal(profil.city, 'Annecy')
	assert.equal(profil.available, null)
	assert.deepEqual(profil.skills, [{ id: 1, name: 'Mariée' }])
	assert.equal(profil.main_picture.url, 'https://r2.example.test/a.webp')
	for (const champ of Object.keys(profil)) {
		assert.ok(CHAMPS_PROFIL.includes(champ) || champ === 'user', champ)
	}
})

test('the account keeps its id, username and email only', () => {
	assert.deepEqual(filtrerProfilPrive(brut).user, {
		id: 7,
		username: 'marie',
		email: 'marie@test.local',
	})
})

test('no hash, token or admin relation, at any depth', () => {
	const texte = JSON.stringify(filtrerProfilPrive(brut))
	assert.doesNotMatch(texte, /\$2[aby]\$|password|Token|createdBy|updatedBy/)
})

test('fields outside the allow list are dropped (pro, score)', () => {
	const profil = filtrerProfilPrive(brut)
	assert.equal(profil.pro, undefined)
	assert.equal(profil.score, undefined)
})

test('not a profile: null', () => {
	assert.equal(filtrerProfilPrive(null), null)
	assert.equal(filtrerProfilPrive([]), null)
	assert.equal(filtrerProfilPrive('x'), null)
})

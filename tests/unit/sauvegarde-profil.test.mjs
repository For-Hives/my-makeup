import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
	erreurNom,
	fermerSiLibre,
	listeApresSauvegarde,
	messageEchecSauvegarde,
	NOM_MAX,
	NOM_MIN,
	offresAEnvoyer,
	photoRefusee,
	profilCree,
	sauvegarderProfil,
	SECTIONS_PROFIL,
} from '../../src/lib/sauvegarde-profil.js'
import { eventData } from '../../src/lib/analytics.js'

// what the me-makeup controller of the API answers on a refused PATCH
const refusStrapi = moreDetails => ({
	data: null,
	error: {
		status: 400,
		name: 'BadRequestError',
		message: 'updating Makeup Artist error',
		details: { moreDetails },
	},
})

// what the me-makeup controller of the API answers for a picture that is not
// hers (api-my-makeup #385): nothing was saved
const fichierRefuse = (files = [123]) => ({
	data: null,
	error: {
		status: 400,
		name: 'BadRequestError',
		message: 'File not allowed',
		details: { moreDetails: 'File not allowed', files },
	},
})
const MESSAGE_PHOTO_REFUSEE =
	"Choisis à nouveau ta photo : elle n'a pas été acceptée, et tes modifications n'ont pas été enregistrées."

describe('messageEchecSauvegarde', () => {
	test('network error, expired session, brake and outage', () => {
		assert.match(messageEchecSauvegarde(0), /Connexion impossible/)
		assert.match(messageEchecSauvegarde(undefined), /Connexion impossible/)
		assert.match(messageEchecSauvegarde(401), /session a expiré/)
		assert.match(messageEchecSauvegarde(429), /Trop d'essais/)
		for (const status of [500, 502, 503, 504])
			assert.match(messageEchecSauvegarde(status), /indisponible/)
	})

	test('every failure says that nothing was saved', () => {
		for (const [status, corps] of [
			[0],
			[401],
			[429],
			[500],
			[400, refusStrapi('anything')],
			[400, fichierRefuse()],
		])
			assert.match(
				messageEchecSauvegarde(status, corps),
				/n'ont pas été enregistrées/
			)
	})

	test('a length rule of the API becomes a French sentence', () => {
		assert.equal(
			messageEchecSauvegarde(
				400,
				refusStrapi('first_name must be at least 2 characters')
			),
			'Le prénom doit contenir au moins 2 caractères.'
		)
		assert.equal(
			messageEchecSauvegarde(
				400,
				refusStrapi('last_name must be at least 2 characters')
			),
			'Le nom doit contenir au moins 2 caractères.'
		)
		assert.equal(
			messageEchecSauvegarde(
				400,
				refusStrapi('last_name must be at most 70 characters')
			),
			'Le nom doit contenir au plus 70 caractères.'
		)
	})

	test('never echoes the API text', () => {
		const message = messageEchecSauvegarde(
			400,
			refusStrapi('<script>alert(1)</script> 2 errors occurred')
		)
		assert.doesNotMatch(message, /script|errors occurred|Makeup Artist/)
		assert.doesNotMatch(
			messageEchecSauvegarde(
				400,
				refusStrapi('secret_field must be at least 3 characters')
			),
			/secret_field/
		)
	})

	test('400 « File not allowed »: she is asked to pick her photo again', () => {
		assert.equal(
			messageEchecSauvegarde(400, fichierRefuse()),
			MESSAGE_PHOTO_REFUSEE
		)
		// connect/set objects: refused without any file id
		assert.equal(
			messageEchecSauvegarde(400, fichierRefuse([])),
			MESSAGE_PHOTO_REFUSEE
		)
	})

	test('a missing profile asks for a reload; odd bodies do not throw', () => {
		assert.match(
			messageEchecSauvegarde(
				400,
				refusStrapi('Makeup artist does not exist for this user')
			),
			/recharge la page/
		)
		for (const corps of [null, 'texte', [], { error: 'x' }, { error: null }])
			assert.equal(typeof messageEchecSauvegarde(400, corps), 'string')
	})
})

describe('photoRefusee (PATCH /api/me-makeup)', () => {
	test('400 « File not allowed » of the API, nothing else', () => {
		assert.equal(photoRefusee(400, fichierRefuse()), true)
		assert.equal(photoRefusee(400, fichierRefuse([])), true)
		// the same text with another status, or another refusal
		for (const status of [0, 401, 403, 413, 500])
			assert.equal(photoRefusee(status, fichierRefuse()), false)
		assert.equal(
			photoRefusee(
				400,
				refusStrapi('first_name must be at least 2 characters')
			),
			false
		)
		assert.equal(photoRefusee(400, refusStrapi('Files not allowedly')), false)
		for (const corps of [
			undefined,
			null,
			'File not allowed',
			[],
			{ error: 'File not allowed' },
		])
			assert.equal(photoRefusee(400, corps), false)
	})
})

describe('sauvegarderProfil (patchMeMakeup)', () => {
	// the ports of patchMeMakeup: the PATCH answers `reponse` (a function
	// for a network error), the counter keeps its events
	const ports = reponse => {
		const envois = []
		const evenements = []
		return {
			envois,
			evenements,
			envoyer: async corps => {
				envois.push(corps)
				return typeof reponse === 'function' ? reponse() : reponse
			},
			compter: (nom, props) => evenements.push([nom, props]),
		}
	}
	const json = (status, corps) =>
		new Response(JSON.stringify(corps), {
			status,
			headers: { 'content-type': 'application/json' },
		})
	const nom = { first_name: 'Al', last_name: 'Bo' }

	test('saved: ok with the stored profile, the fields sent as JSON, one event', async () => {
		const p = ports(json(200, { id: 11, ...nom }))
		const resultat = await sauvegarderProfil(nom, 'identite', p)

		assert.deepEqual(resultat, { ok: true, data: { id: 11, ...nom } })
		assert.deepEqual(p.envois.map(JSON.parse), [nom])
		assert.deepEqual(p.evenements, [
			['profile_save', { section: 'identite', ok: true }],
		])
	})

	test('the event is in the catalogue and carries nothing typed', async () => {
		for (const [reponse, ok] of [
			[json(200, nom), true],
			[json(500, {}), false],
		]) {
			const p = ports(reponse)
			await sauvegarderProfil(
				{ first_name: 'Alice', network: { email: 'alice@test.local' } },
				'reseaux',
				p
			)
			const [[evenement, props]] = p.evenements
			assert.deepEqual(eventData(evenement, props), { section: 'reseaux', ok })
			assert.doesNotMatch(JSON.stringify(props), /Alice|@/)
		}
	})

	test('500: not ok, the outage message, counted as a failure', async () => {
		const p = ports(json(500, refusStrapi('forced failure')))
		const resultat = await sauvegarderProfil(nom, 'description', p)

		assert.deepEqual(resultat, {
			ok: false,
			error:
				"Le service est momentanément indisponible : tes modifications n'ont pas été enregistrées. Réessaie dans quelques minutes.",
		})
		assert.deepEqual(p.evenements, [
			['profile_save', { section: 'description', ok: false }],
		])
	})

	test('400 of the API: its rule in French', async () => {
		const p = ports(
			json(400, refusStrapi('first_name must be at least 2 characters'))
		)
		const resultat = await sauvegarderProfil({ first_name: 'A' }, 'identite', p)
		assert.deepEqual(resultat, {
			ok: false,
			error: 'Le prénom doit contenir au moins 2 caractères.',
		})
	})

	test('400 « File not allowed »: flagged, so the modal drops the sent picture', async () => {
		const p = ports(json(400, fichierRefuse([131])))
		const resultat = await sauvegarderProfil(
			{ first_name: 'Al', main_picture: 131 },
			'identite',
			p
		)
		assert.deepEqual(resultat, {
			ok: false,
			error: MESSAGE_PHOTO_REFUSEE,
			photoRefusee: true,
		})
		assert.deepEqual(p.evenements, [
			['profile_save', { section: 'identite', ok: false }],
		])
		// any other failure is not flagged
		for (const reponse of [
			json(400, refusStrapi('first_name must be at least 2 characters')),
			json(500, fichierRefuse()),
		])
			assert.equal(
				'photoRefusee' in
					(await sauvegarderProfil(nom, 'portfolio', ports(reponse))),
				false
			)
	})

	test('API out of reach: not ok, the connection message, counted', async () => {
		const p = ports(() => {
			throw new TypeError('Failed to fetch')
		})
		const resultat = await sauvegarderProfil(nom, 'localisation', p)

		assert.equal(resultat.ok, false)
		assert.match(resultat.error, /Connexion impossible/)
		assert.deepEqual(p.evenements, [
			['profile_save', { section: 'localisation', ok: false }],
		])
	})

	test('expired session (null): not ok, flagged, counted', async () => {
		const p = ports(null)
		const resultat = await sauvegarderProfil(nom, 'offres', p)

		assert.equal(resultat.ok, false)
		assert.equal(resultat.sessionExpiree, true)
		assert.match(resultat.error, /session a expiré/)
		assert.deepEqual(p.evenements, [
			['profile_save', { section: 'offres', ok: false }],
		])
	})

	test('saved with an unreadable answer: still ok, no data', async () => {
		const p = ports(new Response('pas du JSON', { status: 200 }))
		assert.deepEqual(await sauvegarderProfil(nom, 'portfolio', p), {
			ok: true,
			data: null,
		})
	})
})

describe('profilCree (POST /api/me-makeup of the onboarding)', () => {
	test('2xx, or a profile that already exists', () => {
		assert.equal(profilCree(200, { id: 1 }), true)
		assert.equal(profilCree(201), true)
		assert.equal(
			profilCree(400, {
				error: {
					message: 'Makeup artist initialisation error',
					details: {
						moreDetails: 'Makeup artist already exists for this user',
					},
				},
			}),
			true
		)
	})

	test('anything else is a failure', () => {
		assert.equal(profilCree(400, { error: { message: 'other' } }), false)
		assert.equal(profilCree(500), false)
		assert.equal(profilCree(0), false)
		assert.equal(profilCree(401), false)
	})
})

describe('erreurNom (onboarding and identity forms)', () => {
	test('2 characters are enough (« Al »), 1 is not', () => {
		assert.equal(NOM_MIN, 2)
		assert.equal(erreurNom('Al', 'first_name'), null)
		assert.equal(erreurNom('  Bo  ', 'last_name'), null)
		assert.equal(
			erreurNom('A', 'first_name'),
			'Le prénom doit contenir au moins 2 caractères.'
		)
		assert.equal(
			erreurNom('   ', 'last_name'),
			'Le nom doit contenir au moins 2 caractères.'
		)
		assert.match(erreurNom(undefined), /au moins 2/)
	})

	test('70 characters at most', () => {
		assert.equal(erreurNom('a'.repeat(NOM_MAX)), null)
		assert.match(erreurNom('a'.repeat(NOM_MAX + 1)), /au plus 70/)
	})
})

describe('listeApresSauvegarde', () => {
	test('the list answered by the API, with its ids', () => {
		const locale = [{ id: 'addedStudio', company: 'Studio' }]
		const reponse = { experiences: [{ id: 12, company: 'Studio' }] }
		assert.deepEqual(
			listeApresSauvegarde(reponse, 'experiences', locale),
			reponse.experiences
		)
	})

	test('the local list when the answer has none', () => {
		const locale = [{ id: 'addedStudio' }]
		for (const reponse of [null, undefined, {}, [], { experiences: null }])
			assert.equal(listeApresSauvegarde(reponse, 'experiences', locale), locale)
	})

	// what updateMakeupArtist answers: populate one level, no options
	const envoyees = [
		{
			name: 'Offre A',
			price: '100',
			description: 'A',
			options: [{ name: 'Option 1', price: '10', description: 'o' }],
		},
		{ name: 'Offre B', price: '50', description: 'B', options: [] },
	]
	const reponseStrapi = {
		service_offers: [
			{ id: 7, name: 'Offre A', price: '100', description: 'A' },
			{ id: 8, name: 'Offre B', price: '50', description: 'B' },
		],
	}

	test('the options of an offer stay when the answer leaves them out', () => {
		const liste = listeApresSauvegarde(
			reponseStrapi,
			'service_offers',
			envoyees
		)
		assert.deepEqual(
			liste.map(offre => offre.id),
			[7, 8]
		)
		assert.deepEqual(liste[0].options, envoyees[0].options)
		assert.deepEqual(liste[1].options, [])
	})

	test('what the API stored wins over what was sent', () => {
		const liste = listeApresSauvegarde(
			{
				experiences: [{ id: 3, company: 'Studio', date_end: null }],
			},
			'experiences',
			[{ id: 'addedStudio', company: 'Studio', date_end: '' }]
		)
		assert.deepEqual(liste, [{ id: 3, company: 'Studio', date_end: null }])

		const avecOptions = listeApresSauvegarde(
			{
				service_offers: [
					{ id: 7, options: [{ id: 70, name: 'Option 1' }] },
					{ id: 8, options: [] },
				],
			},
			'service_offers',
			envoyees
		)
		assert.deepEqual(avecOptions[0].options, [{ id: 70, name: 'Option 1' }])
	})

	test('the list sent when the answer has another length or odd items', () => {
		assert.equal(
			listeApresSauvegarde(
				{ service_offers: reponseStrapi.service_offers.slice(1) },
				'service_offers',
				envoyees
			),
			envoyees
		)
		assert.deepEqual(
			listeApresSauvegarde(
				{ service_offers: [null, 'x'] },
				'service_offers',
				envoyees
			),
			envoyees
		)
	})
})

describe('fermerSiLibre', () => {
	test('closes when nothing runs, waits while a save runs', () => {
		let fermetures = 0
		const fermer = () => fermetures++
		fermerSiLibre(true, fermer)()
		assert.equal(fermetures, 0)
		fermerSiLibre(false, fermer)()
		assert.equal(fermetures, 1)
	})
})

describe('offresAEnvoyer', () => {
	test('every offer with all its options, without any id', () => {
		assert.deepEqual(
			offresAEnvoyer([
				{
					id: 0,
					name: 'Offre A',
					price: '100',
					description: 'A',
					options: [
						{ id: 12, name: 'Option 1', price: '10', description: 'o' },
						{ id: 'added1', name: 'Option 2', price: '20', description: 'p' },
					],
				},
			]),
			[
				{
					name: 'Offre A',
					price: '100',
					description: 'A',
					options: [
						{ name: 'Option 1', price: '10', description: 'o' },
						{ name: 'Option 2', price: '20', description: 'p' },
					],
				},
			]
		)
	})

	test('an offer without options is sent with an empty list', () => {
		assert.deepEqual(
			offresAEnvoyer([
				{ id: 'addedB', name: 'B', price: '5', description: 'b' },
			]),
			[{ name: 'B', price: '5', description: 'b', options: [] }]
		)
		assert.deepEqual(offresAEnvoyer(undefined), [])
	})
})

test('one section per modal and the onboarding, all distinct', () => {
	assert.equal(new Set(SECTIONS_PROFIL).size, SECTIONS_PROFIL.length)
	for (const section of [
		'identite',
		'description',
		'localisation',
		'reseaux',
		'competences',
		'langues',
		'formations',
		'experiences',
		'offres',
		'portfolio',
		'onboarding',
	])
		assert.ok(SECTIONS_PROFIL.includes(section), section)
})

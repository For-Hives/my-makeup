import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import type { Payload } from 'payload'
import { UnverifiedEmail } from 'payload'
import { confirmerLEmail } from '@/lib/auth/confirmation'
import { codeDeLEchec } from '@/lib/auth/connexion'
import { messageErreur } from '@/lib/auth/erreurs'
import {
	CHAMPS_INSCRIPTION,
	MESSAGES_ECHEC_INSCRIPTION,
	MESSAGES_INSCRIPTION,
	validerInscription,
} from '@/lib/auth/inscription'
import { codeDeLEchec as codeDeLEchecDInscription, estUneAdresseDejaPrise } from '@/lib/auth/inscription-payload'
import { contenuEmailConfirmation } from '@/lib/emails/confirmation'
import { composerEmail } from '@/lib/emails/gabarit'

const BON = { nom: 'Léa Fictive', email: 'lea@example.test', password: 'aaaaaaaa', cgu: 'on' }

describe('U24 : les règles de l’inscription', () => {
	test('un email valide, 8 caractères et les conditions cochées : accepté, nom et email nettoyés', () => {
		const resultat = validerInscription({ ...BON, nom: '  Léa Fictive ', email: ' lea@example.test ' })
		expect(resultat).toEqual({
			ok: true,
			donnees: { nom: 'Léa Fictive', email: 'lea@example.test', password: 'aaaaaaaa' },
		})
	})

	test('le mot de passe n’a aucune règle de composition : 8 lettres minuscules suffisent', () => {
		for (const password of ['aaaaaaaa', '12345678', 'abcdefgh', '        ', 'é'.repeat(8)])
			expect(validerInscription({ ...BON, password }).ok).toBe(true)
	})

	test('7 caractères sont refusés, 8 acceptés ; le mot de passe n’est jamais rogné', () => {
		expect(validerInscription({ ...BON, password: 'a'.repeat(7) }).ok).toBe(false)
		expect(validerInscription({ ...BON, password: 'a'.repeat(8) }).ok).toBe(true)
		const resultat = validerInscription({ ...BON, password: '  abcdefg  ' })
		expect(resultat.ok && resultat.donnees.password).toBe('  abcdefg  ')
	})

	test('le nom est libre : un nom de 1 caractère passe, un nom pris par une autre maquilleuse n’est pas vérifié ici', () => {
		expect(validerInscription({ ...BON, nom: 'Z' }).ok).toBe(true)
		expect(validerInscription({ ...BON, nom: 'Marie' }).ok).toBe(true)
	})

	test('les conditions générales sont obligatoires', () => {
		for (const cgu of [undefined, '', 'off', false, null])
			expect(validerInscription({ ...BON, cgu })).toEqual({
				ok: false,
				erreurs: { cgu: MESSAGES_INSCRIPTION.cgu.refusees },
			})
		expect(validerInscription({ ...BON, cgu: 'true' }).ok).toBe(true)
	})

	test('des adresses mal formées sont refusées', () => {
		for (const email of ['lea', 'lea@', '@example.test', 'lea@example', 'lea example@example.test', 'a@@b.test'])
			expect(validerInscription({ ...BON, email }).ok, email).toBe(false)
	})

	test('des valeurs qui ne sont pas du texte sont des champs vides', () => {
		const resultat = validerInscription({ nom: 1, email: null, password: undefined, cgu: 'on' })
		expect(resultat.ok).toBe(false)
	})
})

describe('U25 : un message en français par champ', () => {
	test('tout vide : un message par champ, le premier de la règle enfreinte', () => {
		const resultat = validerInscription({})
		expect(resultat).toEqual({
			ok: false,
			erreurs: {
				nom: MESSAGES_INSCRIPTION.nom.vide,
				email: MESSAGES_INSCRIPTION.email.vide,
				password: MESSAGES_INSCRIPTION.password.vide,
				cgu: MESSAGES_INSCRIPTION.cgu.refusees,
			},
		})
	})

	test('chaque champ ne donne qu’un message, même s’il enfreint plusieurs règles', () => {
		const resultat = validerInscription({
			...BON,
			nom: 'x'.repeat(500),
			email: 'x'.repeat(500),
			password: 'a'.repeat(3),
		})
		if (resultat.ok) throw new Error('accepté')
		expect(Object.keys(resultat.erreurs).sort()).toEqual(['email', 'nom', 'password'])
		expect(resultat.erreurs.password).toBe(MESSAGES_INSCRIPTION.password.court)
		expect(resultat.erreurs.nom).toBe(MESSAGES_INSCRIPTION.nom.long)
		expect(resultat.erreurs.email).toBe(MESSAGES_INSCRIPTION.email.long)
	})

	test('un seul champ fautif : seul ce champ a un message', () => {
		expect(validerInscription({ ...BON, email: 'lea' })).toEqual({
			ok: false,
			erreurs: { email: MESSAGES_INSCRIPTION.email.invalide },
		})
	})

	test('tous les messages sont en français, tutoient, finissent par un point et ne montrent aucun terme technique', () => {
		const messages = [
			...Object.values(MESSAGES_INSCRIPTION).flatMap(champ => Object.values(champ)),
			...Object.values(MESSAGES_ECHEC_INSCRIPTION),
			messageErreur('email-non-confirme'),
		]
		expect(messages.length).toBeGreaterThan(10)
		for (const message of messages) {
			expect(message, message).toMatch(/^[A-ZÉ].*[.!)]$/)
			expect(message, message).not.toMatch(/\b(zod|undefined|null|invalid|required|too|string)\b/i)
		}
		expect(CHAMPS_INSCRIPTION).toEqual(['nom', 'email', 'password', 'cgu'])
	})
})

describe('connexion avant confirmation', () => {
	const t = ((cle: string) => cle) as never

	test('le refus « adresse non confirmée » de Payload a son code et son message', () => {
		expect(codeDeLEchec(new UnverifiedEmail({ t }))).toBe('email-non-confirme')
		expect(messageErreur('email-non-confirme')).toContain('pas encore confirmée')
	})

	test('un mot de passe faux, une adresse inconnue ou une panne gardent leurs codes', () => {
		expect(codeDeLEchec(Object.assign(new Error('x'), { status: 401 }))).toBe('identifiants-invalides')
		expect(codeDeLEchec(Object.assign(new Error('x'), { status: 429 }))).toBe('trop-de-tentatives')
		expect(codeDeLEchec(new Error('base injoignable'))).toBe('service-indisponible')
	})
})

describe('l’email de confirmation', () => {
	const JETON = 'ab12'.repeat(10)

	test('un bouton « Confirmer mon adresse » vers la page de confirmation, lien absolu, tutoiement', () => {
		const email = composerEmail(contenuEmailConfirmation(JETON), 'https://v3.my-makeup.fr')
		expect(email.lien).toBe(`https://v3.my-makeup.fr/auth/verification-complete?code=${JETON}`)
		expect(email.texte).toContain('Confirmer mon adresse')
		expect(email.html).toContain('Confirme')
		expect(email.sujet).toContain('Confirme ton adresse email')
	})

	test('le lien ne mène jamais à l’administration', () => {
		const email = composerEmail(contenuEmailConfirmation(JETON), 'https://my-makeup.fr')
		expect(email.lien).not.toContain('/admin')
	})
})

describe('confirmerLEmail : la logique du lien, sans base', () => {
	const JETON = 'cd34'.repeat(10)
	const TRACE = `utilise:${createHash('sha256').update(JETON).digest('hex')}`

	function fauxPayload(ligne: Record<string, unknown> | null) {
		const ecritures: Record<string, unknown>[] = []
		const requetes: unknown[] = []
		const payload = {
			db: {
				findOne: (options: unknown) => {
					requetes.push(options)
					return Promise.resolve(ligne)
				},
				updateOne: (options: { data: Record<string, unknown> }) => {
					ecritures.push(options.data)
					return Promise.resolve(null)
				},
			},
		} as unknown as Payload
		return { payload, ecritures, requetes }
	}

	test('un jeton qui n’a pas la forme d’un jeton est refusé sans interroger la base', async () => {
		const { payload, requetes } = fauxPayload(null)
		for (const code of [undefined, '', 'abc', 'x'.repeat(40), `${JETON}0`, 12, ["' or 1=1 --"], { a: 1 }, null])
			expect(await confirmerLEmail(payload, code)).toBe('lien-invalide')
		expect(requetes).toHaveLength(0)
	})

	test('un jeton inconnu : lien invalide, rien n’est écrit', async () => {
		const { payload, ecritures } = fauxPayload(null)
		expect(await confirmerLEmail(payload, JETON)).toBe('lien-invalide')
		expect(ecritures).toHaveLength(0)
	})

	test('un jeton d’un compte non confirmé : confirmé, et le jeton est remplacé par sa trace', async () => {
		const { payload, ecritures } = fauxPayload({ id: 4, _verified: false, _verificationToken: JETON })
		expect(await confirmerLEmail(payload, JETON)).toBe('ok')
		expect(ecritures).toHaveLength(1)
		expect(ecritures[0]).toMatchObject({ _verified: true, _verificationToken: TRACE })
		expect(JSON.stringify(ecritures)).not.toContain(JETON)
	})

	test('le même lien une seconde fois : déjà confirmé, rien n’est écrit', async () => {
		const { payload, ecritures } = fauxPayload({ id: 4, _verified: true, _verificationToken: TRACE })
		expect(await confirmerLEmail(payload, JETON)).toBe('deja-confirme')
		expect(ecritures).toHaveLength(0)
	})

	test('le journal reçoit l’issue, jamais le jeton ; une panne du journal ne change rien', async () => {
		const { payload } = fauxPayload({ id: 4, _verified: false, _verificationToken: JETON })
		const lignes: unknown[] = []
		const resultat = await confirmerLEmail(payload, JETON, e => {
			lignes.push(e)
			return Promise.reject(new Error('journal en panne'))
		})
		expect(resultat).toBe('ok')
		expect(lignes).toHaveLength(1)
		expect(lignes[0]).toMatchObject({ type: 'confirmation', code: 'ok' })
		expect(JSON.stringify(lignes)).not.toContain(JETON)
	})
})

describe('« adresse déjà utilisée » : seulement pour l’unicité de l’email (ticket 224)', () => {
	// The two shapes Payload gives, as the real ones read on the bench (tests/integration/auth-inscription-email-pris.test.ts).
	const refus = (message: string, path = 'email') => ({ data: { errors: [{ message, path }] } })
	const unicite = refus("Un utilisateur avec l'email donné est déjà enregistré.")
	const forme = refus('S’il vous plaît, veuillez entrer une adresse e-mail valide.')

	test('l’unicité (auth ou index, en français ou en anglais) est une adresse déjà prise', () => {
		for (const erreur of [
			unicite,
			refus('La valeur doit être unique'),
			refus('Value must be unique'),
			refus('A user with the given email is already registered.'),
		]) {
			expect(estUneAdresseDejaPrise(erreur)).toBe(true)
			expect(codeDeLEchecDInscription(erreur)).toBe('email-deja-pris')
		}
	})

	test('une erreur de forme sur l’email, ou l’unicité d’un autre champ, ne l’est pas', () => {
		for (const erreur of [forme, refus('La valeur doit être unique', 'nom'), new Error('x'), null, { data: {} }])
			expect(estUneAdresseDejaPrise(erreur)).toBe(false)
	})

	test('une erreur de forme sur l’email est un refus du champ ; toute autre est un service indisponible', () => {
		expect(codeDeLEchecDInscription(forme)).toBe('email-invalide')
		for (const erreur of [refus('La valeur doit être unique', 'nom'), new Error('x'), null, { data: {} }])
			expect(codeDeLEchecDInscription(erreur)).toBe('service-indisponible')
	})
})

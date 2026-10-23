import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import type { Payload } from 'payload'
import { UnverifiedEmail } from 'payload'
import { confirmEmail } from '@/lib/auth/confirmation'
import { errorMessage } from '@/lib/auth/errors'
import { failureCode } from '@/lib/auth/sign-in'
import {
	accountName,
	SIGN_UP_FAILURE_MESSAGES,
	SIGN_UP_FIELDS,
	SIGN_UP_MESSAGES,
	validateSignUp,
} from '@/lib/auth/sign-up'
import { failureCode as codeDeLEchecDInscription, isAddressAlreadyTaken } from '@/lib/auth/sign-up-payload'
import { confirmationEmailContent } from '@/lib/emails/confirmation'
import { composerEmail } from '@/lib/emails/layout'

const GOOD = { prenom: 'Léa', nom: 'Fictive', email: 'lea@example.test', password: 'aaaaaaaa', cgu: 'on' }

describe('U24 : les règles de l’inscription', () => {
	test('un email valide, 8 caractères et les conditions cochées : accepté, nom et email nettoyés', () => {
		const result = validateSignUp({ ...GOOD, prenom: '  Léa ', nom: ' Fictive ', email: ' lea@example.test ' })
		expect(result).toEqual({
			ok: true,
			donnees: { prenom: 'Léa', nom: 'Fictive', email: 'lea@example.test', password: 'aaaaaaaa' },
		})
	})

	test('le mot de passe n’a aucune règle de composition : 8 lettres minuscules suffisent', () => {
		for (const password of ['aaaaaaaa', '12345678', 'abcdefgh', '        ', 'é'.repeat(8)])
			expect(validateSignUp({ ...GOOD, password }).ok).toBe(true)
	})

	test('7 caractères sont refusés, 8 acceptés ; le mot de passe n’est jamais rogné', () => {
		expect(validateSignUp({ ...GOOD, password: 'a'.repeat(7) }).ok).toBe(false)
		expect(validateSignUp({ ...GOOD, password: 'a'.repeat(8) }).ok).toBe(true)
		const result = validateSignUp({ ...GOOD, password: '  abcdefg  ' })
		expect(result.ok && result.donnees.password).toBe('  abcdefg  ')
	})

	test('le prénom et le nom sont libres : un caractère passe, un nom pris par une autre maquilleuse n’est pas vérifié ici', () => {
		expect(validateSignUp({ ...GOOD, prenom: 'Z', nom: 'Z' }).ok).toBe(true)
		expect(validateSignUp({ ...GOOD, prenom: 'Marie', nom: 'Marie' }).ok).toBe(true)
	})

	test('le prénom et le nom sont demandés tous les deux, chacun avec son message', () => {
		expect(validateSignUp({ ...GOOD, prenom: '  ' })).toEqual({
			ok: false,
			erreurs: { prenom: SIGN_UP_MESSAGES.prenom.vide },
		})
		expect(validateSignUp({ ...GOOD, nom: '' })).toEqual({ ok: false, erreurs: { nom: SIGN_UP_MESSAGES.nom.vide } })
	})

	test('le compte porte « Prénom Nom », d’où vient son adresse de page', () => {
		const result = validateSignUp(GOOD)
		expect(result.ok && accountName(result.donnees)).toBe('Léa Fictive')
	})

	test('les conditions générales sont obligatoires', () => {
		for (const cgu of [undefined, '', 'off', false, null])
			expect(validateSignUp({ ...GOOD, cgu })).toEqual({
				ok: false,
				erreurs: { cgu: SIGN_UP_MESSAGES.cgu.refusees },
			})
		expect(validateSignUp({ ...GOOD, cgu: 'true' }).ok).toBe(true)
	})

	test('des adresses mal formées sont refusées', () => {
		for (const email of ['lea', 'lea@', '@example.test', 'lea@example', 'lea example@example.test', 'a@@b.test'])
			expect(validateSignUp({ ...GOOD, email }).ok, email).toBe(false)
	})

	test('des valeurs qui ne sont pas du texte sont des champs vides', () => {
		const result = validateSignUp({ prenom: 2, nom: 1, email: null, password: undefined, cgu: 'on' })
		expect(result.ok).toBe(false)
	})
})

describe('U25 : un message en français par champ', () => {
	test('tout vide : un message par champ, le premier de la règle enfreinte', () => {
		const result = validateSignUp({})
		expect(result).toEqual({
			ok: false,
			erreurs: {
				prenom: SIGN_UP_MESSAGES.prenom.vide,
				nom: SIGN_UP_MESSAGES.nom.vide,
				email: SIGN_UP_MESSAGES.email.vide,
				password: SIGN_UP_MESSAGES.password.vide,
				cgu: SIGN_UP_MESSAGES.cgu.refusees,
			},
		})
	})

	test('chaque champ ne donne qu’un message, même s’il enfreint plusieurs règles', () => {
		const result = validateSignUp({
			...GOOD,
			nom: 'x'.repeat(500),
			email: 'x'.repeat(500),
			password: 'a'.repeat(3),
		})
		if (result.ok) throw new Error('accepté')
		expect(Object.keys(result.erreurs).sort()).toEqual(['email', 'nom', 'password'])
		expect(result.erreurs.password).toBe(SIGN_UP_MESSAGES.password.court)
		expect(result.erreurs.nom).toBe(SIGN_UP_MESSAGES.nom.long)
		expect(result.erreurs.email).toBe(SIGN_UP_MESSAGES.email.long)
	})

	test('un seul champ fautif : seul ce champ a un message', () => {
		expect(validateSignUp({ ...GOOD, email: 'lea' })).toEqual({
			ok: false,
			erreurs: { email: SIGN_UP_MESSAGES.email.invalide },
		})
	})

	test('tous les messages sont en français, tutoient, finissent par un point et ne montrent aucun terme technique', () => {
		const messages = [
			...Object.values(SIGN_UP_MESSAGES).flatMap(champ => Object.values(champ)),
			...Object.values(SIGN_UP_FAILURE_MESSAGES),
			errorMessage('email-non-confirme'),
		]
		expect(messages.length).toBeGreaterThan(10)
		for (const message of messages) {
			expect(message, message).toMatch(/^[A-ZÉ].*[.!)]$/)
			expect(message, message).not.toMatch(/\b(zod|undefined|null|invalid|required|too|string)\b/i)
		}
		expect(SIGN_UP_FIELDS).toEqual(['prenom', 'nom', 'email', 'password', 'cgu'])
	})
})

describe('connexion avant confirmation', () => {
	const t = ((cle: string) => cle) as never

	test('le refus « adresse non confirmée » de Payload a son code et son message', () => {
		expect(failureCode(new UnverifiedEmail({ t }))).toBe('email-non-confirme')
		expect(errorMessage('email-non-confirme')).toContain('pas encore confirmée')
	})

	test('un mot de passe faux, une adresse inconnue ou une panne gardent leurs codes', () => {
		expect(failureCode(Object.assign(new Error('x'), { status: 401 }))).toBe('identifiants-invalides')
		expect(failureCode(Object.assign(new Error('x'), { status: 429 }))).toBe('trop-de-tentatives')
		expect(failureCode(new Error('base injoignable'))).toBe('service-indisponible')
	})
})

describe('l’email de confirmation', () => {
	const TOKEN = 'ab12'.repeat(10)

	test('un bouton « Confirmer mon adresse » vers la page de confirmation, lien absolu, tutoiement', () => {
		const email = composerEmail(confirmationEmailContent(TOKEN), 'https://v3.my-makeup.fr')
		expect(email.lien).toBe(`https://v3.my-makeup.fr/auth/verification-complete?code=${TOKEN}`)
		expect(email.texte).toContain('Confirmer mon adresse')
		expect(email.html).toContain('Confirme')
		expect(email.sujet).toContain('Confirme ton adresse email')
	})

	test('le lien ne mène jamais à l’administration', () => {
		const email = composerEmail(confirmationEmailContent(TOKEN), 'https://my-makeup.fr')
		expect(email.lien).not.toContain('/admin')
	})
})

describe('confirmerLEmail : la logique du lien, sans base', () => {
	const TOKEN = 'cd34'.repeat(10)
	const HASH = createHash('sha256').update(TOKEN).digest('hex')
	const TRACE = `utilise:${HASH}`
	// Confirmed, the session of the link not yet claimed (ticket 302).
	const PENDING = `pending:${HASH}`

	function fakePayload(ligne: Record<string, unknown> | null, claim: Record<string, unknown> | null = { id: 4 }) {
		const writes: Record<string, unknown>[] = []
		const requests: unknown[] = []
		const payload = {
			db: {
				findOne: (options: unknown) => {
					requests.push(options)
					return Promise.resolve(ligne)
				},
				updateOne: (options: { data: Record<string, unknown> }) => {
					writes.push(options.data)
					return Promise.resolve(claim)
				},
			},
		} as unknown as Payload
		return { payload, ecritures: writes, requetes: requests }
	}

	test('un jeton qui n’a pas la forme d’un jeton est refusé sans interroger la base', async () => {
		const { payload, requetes: requests } = fakePayload(null)
		for (const code of [undefined, '', 'abc', 'x'.repeat(40), `${TOKEN}0`, 12, ["' or 1=1 --"], { a: 1 }, null])
			expect(await confirmEmail(payload, code)).toBe('lien-invalide')
		expect(requests).toHaveLength(0)
	})

	test('un jeton inconnu : lien invalide, rien n’est écrit', async () => {
		const { payload, ecritures: writes } = fakePayload(null)
		expect(await confirmEmail(payload, TOKEN)).toBe('lien-invalide')
		expect(writes).toHaveLength(0)
	})

	test('un jeton d’un compte non confirmé : confirmé, et le jeton est remplacé par sa trace', async () => {
		const { payload, ecritures: writes } = fakePayload({ id: 4, _verified: false, _verificationToken: TOKEN })
		expect(await confirmEmail(payload, TOKEN)).toBe('ok')
		expect(writes).toHaveLength(1)
		expect(writes[0]).toMatchObject({ _verified: true, _verificationToken: PENDING })
		expect(JSON.stringify(writes)).not.toContain(TOKEN)
	})

	test('la prise du lien se perd contre un autre qui l’a prise au même instant : déjà confirmé', async () => {
		const { payload } = fakePayload({ id: 4, _verified: false, _verificationToken: TOKEN }, null)
		expect(await confirmEmail(payload, TOKEN)).toBe('deja-confirme')
	})

	test('le même lien une seconde fois : déjà confirmé, rien n’est écrit', async () => {
		const { payload, ecritures: writes } = fakePayload({ id: 4, _verified: true, _verificationToken: TRACE })
		expect(await confirmEmail(payload, TOKEN)).toBe('deja-confirme')
		expect(writes).toHaveLength(0)
	})

	test('le journal reçoit l’issue, jamais le jeton ; une panne du journal ne change rien', async () => {
		const { payload } = fakePayload({ id: 4, _verified: false, _verificationToken: TOKEN })
		const lines: unknown[] = []
		const result = await confirmEmail(payload, TOKEN, e => {
			lines.push(e)
			return Promise.reject(new Error('journal en panne'))
		})
		expect(result).toBe('ok')
		expect(lines).toHaveLength(1)
		expect(lines[0]).toMatchObject({ type: 'confirmation', code: 'ok' })
		expect(JSON.stringify(lines)).not.toContain(TOKEN)
	})
})

describe('« adresse déjà utilisée » : seulement pour l’unicité de l’email (ticket 224)', () => {
	// The two shapes Payload gives, as the real ones read on the bench (tests/integration/auth-sign-up-email-taken.test.ts).
	const refusal = (message: string, path = 'email') => ({ data: { errors: [{ message, path }] } })
	const uniqueness = refusal("Un utilisateur avec l'email donné est déjà enregistré.")
	const shape = refusal('S’il vous plaît, veuillez entrer une adresse e-mail valide.')

	test('l’unicité (auth ou index, en français ou en anglais) est une adresse déjà prise', () => {
		for (const error of [
			uniqueness,
			refusal('La valeur doit être unique'),
			refusal('Value must be unique'),
			refusal('A user with the given email is already registered.'),
		]) {
			expect(isAddressAlreadyTaken(error)).toBe(true)
			expect(codeDeLEchecDInscription(error)).toBe('email-deja-pris')
		}
	})

	test('une erreur de forme sur l’email, ou l’unicité d’un autre champ, ne l’est pas', () => {
		for (const error of [shape, refusal('La valeur doit être unique', 'nom'), new Error('x'), null, { data: {} }])
			expect(isAddressAlreadyTaken(error)).toBe(false)
	})

	test('une erreur de forme sur l’email est un refus du champ ; toute autre est un service indisponible', () => {
		expect(codeDeLEchecDInscription(shape)).toBe('email-invalide')
		for (const error of [refusal('La valeur doit être unique', 'nom'), new Error('x'), null, { data: {} }])
			expect(codeDeLEchecDInscription(error)).toBe('service-indisponible')
	})
})

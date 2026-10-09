import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
	COOKIE_CODE,
	codeEchecReinitialisation,
	codeReinitialisation,
	cookieCode,
	erreurNouveauMotDePasse,
	issueDemandeReinitialisation,
	MESSAGES_MOT_DE_PASSE,
	MOT_DE_PASSE_MIN,
	motDePasseOublieActif,
} from '../../src/lib/mot-de-passe.js'

// a Strapi reset code: crypto.randomBytes(64).toString('hex')
const CODE = 'ab12'.repeat(32)

test('the « Mot de passe oublié ? » link waits for NEXT_PUBLIC_FORGOT_PASSWORD=on', () => {
	assert.equal(motDePasseOublieActif('on'), true)
	assert.equal(motDePasseOublieActif(' ON '), true)
	for (const valeur of [undefined, '', 'off', 'true', '1', 'yes', null]) {
		assert.equal(motDePasseOublieActif(valeur), false, String(valeur))
	}
})

describe('issueDemandeReinitialisation (S12 on the front)', () => {
	test('known and unknown addresses read the same', () => {
		// 200 ok:true for both; 500 when the provider fails (known address only)
		for (const status of [200, 204, 400, 500]) {
			assert.equal(issueDemandeReinitialisation(status), 'envoyee', status)
		}
	})

	test('only answers that do not depend on the account differ', () => {
		assert.equal(issueDemandeReinitialisation(429), 'trop-de-tentatives')
		for (const status of [0, 403, 404, 502, 503, 504]) {
			assert.equal(issueDemandeReinitialisation(status), 'service-indisponible', status)
		}
	})

	test('the neutral message never says whether the account exists', () => {
		assert.match(MESSAGES_MOT_DE_PASSE.envoyee, /^Si un compte existe/)
		assert.doesNotMatch(MESSAGES_MOT_DE_PASSE.envoyee, /aucun compte|inconnu/i)
	})
})

describe('codeEchecReinitialisation (Strapi reset-password answers)', () => {
	test('known refusals', () => {
		assert.equal(codeEchecReinitialisation(400, 'Incorrect code provided'), 'code-invalide')
		assert.equal(codeEchecReinitialisation(400, 'Passwords do not match'), 'mots-de-passe-differents')
		assert.equal(codeEchecReinitialisation(400, 'password must be at least 6 characters'), 'mot-de-passe-trop-court')
		assert.equal(codeEchecReinitialisation(429, ''), 'trop-de-tentatives')
		assert.equal(codeEchecReinitialisation(0), 'service-indisponible')
		assert.equal(codeEchecReinitialisation(502), 'service-indisponible')
	})

	test('anything else is unknown, every code has a message', () => {
		assert.equal(codeEchecReinitialisation(400, 'weird'), 'erreur-inconnue')
		assert.equal(codeEchecReinitialisation(403, undefined), 'erreur-inconnue')
		for (const code of [
			'code-invalide',
			'mots-de-passe-differents',
			'mot-de-passe-trop-court',
			'trop-de-tentatives',
			'service-indisponible',
			'erreur-inconnue',
			'code-absent',
		]) {
			assert.ok(MESSAGES_MOT_DE_PASSE[code], code)
		}
	})
})

describe('erreurNouveauMotDePasse', () => {
	test('8 characters at least, no composition rule', () => {
		assert.equal(MOT_DE_PASSE_MIN, 8)
		assert.equal(erreurNouveauMotDePasse('abcdefgh', 'abcdefgh'), null)
		assert.equal(erreurNouveauMotDePasse('abcdefg', 'abcdefg'), 'mot-de-passe-trop-court')
		assert.equal(erreurNouveauMotDePasse(undefined, undefined), 'mot-de-passe-trop-court')
	})

	test('the confirmation must match', () => {
		assert.equal(erreurNouveauMotDePasse('abcdefgh', 'abcdefgH'), 'mots-de-passe-differents')
	})
})

describe('codeReinitialisation', () => {
	test('keeps a Strapi code, from a string or a repeated parameter', () => {
		assert.equal(codeReinitialisation(CODE), CODE)
		assert.equal(codeReinitialisation(` ${CODE} `), CODE)
		assert.equal(codeReinitialisation([CODE, 'autre']), CODE)
	})

	test('drops anything that does not look like a code', () => {
		for (const valeur of [
			undefined,
			null,
			'',
			'court',
			'<script>alert(1)</script>xxxxxxxx',
			`${CODE}; Path=/`,
			'a'.repeat(513),
			42,
			{},
		]) {
			assert.equal(codeReinitialisation(valeur), null, String(valeur))
		}
	})
})

describe('cookieCode', () => {
	test('scoped to the reset page, HttpOnly, one hour, Secure in production', () => {
		const cookie = cookieCode(CODE)
		assert.ok(cookie.startsWith(`${COOKIE_CODE}=${CODE}; `))
		assert.match(cookie, /Path=\/auth\/reinitialiser/)
		assert.match(cookie, /Max-Age=3600/)
		assert.match(cookie, /HttpOnly/)
		assert.match(cookie, /SameSite=Lax/)
		assert.match(cookie, /Secure/)
		assert.doesNotMatch(cookieCode(CODE, { secure: false }), /Secure/)
	})
})

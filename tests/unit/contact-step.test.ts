import { describe, expect, test } from 'bun:test'
import { DASHBOARD_CONTACT_DETAILS_MESSAGES } from '@/lib/dashboard/contact-details'
import { CONTACT_STEP_MESSAGES, readContactStep } from '@/lib/dashboard/contact-step'

/**
 * The contact step of the onboarding (issue 1009): what is sent, and what is kept. Made-up values only.
 */

const NONE = {
	networks: { instagram: '', facebook: '', youtube: '', linkedin: '', siteWeb: '' },
	contact: { telephone: '', email: '', contactPublic: false },
}
const IMPORTED = {
	networks: { ...NONE.networks, facebook: 'https://www.facebook.com/studio.fictif' },
	contact: { telephone: '', email: '', contactPublic: false },
}
const TYPED = { instagram: '', telephone: '', email: '', contactPublic: false }

describe('l’étape « te joindre »', () => {
	test('un @pseudo devient l’adresse Instagram, le reste des réseaux est gardé tel quel', () => {
		const read = readContactStep({ ...TYPED, instagram: '@studio.fictif' }, IMPORTED)
		expect(read).toEqual({
			ok: true,
			networks: { ...IMPORTED.networks, instagram: 'https://www.instagram.com/studio.fictif' },
			contact: null,
		})
	})

	test('un téléphone et la case cochée : les coordonnées sont envoyées, les réseaux non', () => {
		const read = readContactStep({ ...TYPED, telephone: '06 12 34 56 78', contactPublic: true }, NONE)
		expect(read).toEqual({
			ok: true,
			networks: null,
			contact: { telephone: '06 12 34 56 78', email: '', contactPublic: true },
		})
	})

	test('rien de tapé et rien d’enregistré : l’étape dit quoi faire, rien n’est envoyé', () => {
		expect(readContactStep(TYPED, NONE)).toEqual({ ok: 'empty', message: CONTACT_STEP_MESSAGES.empty })
	})

	test('rien de changé sur un profil qui a déjà un contact caché : rien n’est envoyé, rien n’est refusé', () => {
		const stored = { networks: NONE.networks, contact: { telephone: '0612345678', email: '', contactPublic: false } }
		expect(readContactStep({ ...TYPED, telephone: '0612345678' }, stored)).toEqual({
			ok: true,
			networks: null,
			contact: null,
		})
	})

	test('un lien d’un autre site dans le champ Instagram est refusé sous son champ, rien n’est envoyé', () => {
		const read = readContactStep({ ...TYPED, instagram: 'https://www.facebook.com/studio.fictif' }, NONE)
		expect(read.ok).toBe(false)
		if (read.ok === false) expect(Object.keys(read.champs)).toEqual(['instagram'])
	})

	test('un téléphone illisible est refusé sous son champ avec le message de l’espace', () => {
		const read = readContactStep({ ...TYPED, telephone: 'abc' }, NONE)
		expect(read).toEqual({ ok: false, champs: { telephone: DASHBOARD_CONTACT_DETAILS_MESSAGES.telephoneInvalide } })
	})

	test('vider Instagram sur un profil qui en avait un le retire, comme dans l’espace', () => {
		const stored = { ...NONE, networks: { ...NONE.networks, instagram: 'https://www.instagram.com/studio.fictif' } }
		const read = readContactStep({ ...TYPED, telephone: '0612345678', contactPublic: true }, stored)
		expect(read.ok === true && read.networks).toEqual({ ...stored.networks, instagram: '' })
	})
})

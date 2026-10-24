import { describe, expect, test } from 'bun:test'
import { EDIT_QUERY, editPath, formerPreviewTarget, isPreviewRequest, previewPath } from '@/lib/direct-edit/edit-mode'
import { barStatus, saveFromOutcome } from '@/lib/direct-edit/save-state'

/**
 * The shared rules of the direct edition (issue 1008): when the page is in edit mode, and the three
 * honest states a block shows after a save (saving, saved, failed), with the session that ended
 * told apart from any other failure.
 */

describe('l’aperçu se demande par l’adresse, pas par le profil', () => {
	test('seule la valeur « preview » ouvre l’aperçu', () => {
		expect(isPreviewRequest('preview')).toBe(true)
		expect(isPreviewRequest(undefined)).toBe(false)
		expect(isPreviewRequest('')).toBe(false)
		expect(isPreviewRequest('edition')).toBe(false)
		expect(isPreviewRequest(['preview', 'x'])).toBe(false)
	})

	test('l’édition est la page du profil, l’aperçu en est un mode (ancien mode : /auth/apercu-profil?mode=edition)', () => {
		expect(editPath()).toBe('/auth/profil')
		expect(previewPath()).toBe(`/auth/profil?${EDIT_QUERY}=preview`)
	})
})

describe('l’ancienne adresse de l’aperçu', () => {
	test('l’ancien mode édition va à la page en édition, le reste à l’aperçu, aucune autre adresse n’est touchée', () => {
		expect(formerPreviewTarget('/auth/apercu-profil', null)).toBe('/auth/profil?mode=preview')
		expect(formerPreviewTarget('/auth/apercu-profil', 'edition')).toBe('/auth/profil')
		expect(formerPreviewTarget('/auth/apercu-profil', 'autre')).toBe('/auth/profil?mode=preview')
		expect(formerPreviewTarget('/auth/profil', null)).toBeNull()
		expect(formerPreviewTarget('/auth/apercu-profil/x', null)).toBeNull()
	})
})

describe('l’état d’un enregistrement', () => {
	test('une réussite est « enregistré »', () => {
		expect(saveFromOutcome({ ok: true })).toEqual({ kind: 'saved' })
	})

	test('un refus garde son message et ses champs', () => {
		expect(saveFromOutcome({ ok: false, message: 'Non.', champs: { nom: 'Trop court.' } })).toEqual({
			kind: 'error',
			message: 'Non.',
			fields: { nom: 'Trop court.' },
		})
	})

	test('une session expirée n’est pas une erreur ordinaire', () => {
		expect(saveFromOutcome({ ok: false, message: 'Ta session a expiré.', session: 'expiree' })).toEqual({
			kind: 'expired',
			message: 'Ta session a expiré.',
		})
	})
})

describe('ce que dit la barre de l’édition', () => {
	test('rien d’ouvert : rien à dire ; un bloc ouvert : modification en cours', () => {
		expect(barStatus(null, { kind: 'idle' })).toEqual({ kind: 'resting', text: '' })
		expect(barStatus('photo', { kind: 'idle' })).toEqual({ kind: 'editing', text: 'Modification en cours' })
	})

	test('un enregistrement en cours, réussi ou raté le dit, sans jamais montrer « enregistré » trop tôt', () => {
		expect(barStatus('photo', { kind: 'saving' })).toEqual({ kind: 'saving', text: 'Enregistrement…' })
		expect(barStatus(null, { kind: 'saved' })).toEqual({ kind: 'saved', text: 'Enregistré à l’instant' })
		expect(barStatus('photo', { kind: 'error', message: 'x' })).toEqual({
			kind: 'error',
			text: 'Pas enregistré : ta modification est toujours là',
		})
		expect(barStatus('photo', { kind: 'expired', message: 'x' }).kind).toBe('error')
	})
})

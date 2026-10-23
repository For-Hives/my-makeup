import { describe, expect, test } from 'bun:test'
import { EDIT_QUERY, editPath, isEditRequest } from '@/lib/direct-edit/edit-mode'
import { barStatus, saveFromOutcome } from '@/lib/direct-edit/save-state'

/**
 * The shared rules of the direct edition (issue 1008): when the page is in edit mode, and the three
 * honest states a block shows after a save (saving, saved, failed), with the session that ended
 * told apart from any other failure.
 */

describe('le mode édition se demande par l’adresse, pas par le profil', () => {
	test('seule la valeur « edition » ouvre le mode édition', () => {
		expect(isEditRequest('edition')).toBe(true)
		expect(isEditRequest(undefined)).toBe(false)
		expect(isEditRequest('')).toBe(false)
		expect(isEditRequest('apercu')).toBe(false)
		expect(isEditRequest(['edition', 'x'])).toBe(false)
	})

	test('l’adresse du mode édition est celle de l’aperçu avec son paramètre', () => {
		expect(editPath()).toBe(`/auth/apercu-profil?${EDIT_QUERY}=edition`)
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

import { describe, expect, test } from 'bun:test'
import { estUnStatutDeDemande, STATUTS_DE_DEMANDE, transitionPermise } from '@/lib/contact/etats'

/**
 * U78, reduced to the contact message (ticket 163): `nouvelle` → `transmise` → `repondue`, and `spam`.
 * `conclue` and `perdue` of the plan belong to the requests to a makeup artist, which have no ticket yet.
 */
describe('U78 : le cycle des statuts d’un message de contact', () => {
	test('les statuts sont ceux du cycle, et aucun autre', () => {
		expect([...STATUTS_DE_DEMANDE]).toEqual(['nouvelle', 'transmise', 'repondue', 'spam'])
		expect(estUnStatutDeDemande('spam')).toBe(true)
		expect(estUnStatutDeDemande('conclue')).toBe(false)
		expect(estUnStatutDeDemande(undefined)).toBe(false)
	})

	test('le message avance : nouvelle, transmise, répondue', () => {
		expect(transitionPermise('nouvelle', 'transmise')).toBe(true)
		expect(transitionPermise('transmise', 'repondue')).toBe(true)
	})

	test('un admin peut répondre à un message dont l’email a échoué : il l’a lu dans l’administration', () => {
		expect(transitionPermise('nouvelle', 'repondue')).toBe(true)
	})

	test('le spam se marque depuis tous les statuts, et se défait vers « nouvelle »', () => {
		for (const de of ['nouvelle', 'transmise', 'repondue'] as const) expect(transitionPermise(de, 'spam')).toBe(true)
		expect(transitionPermise('spam', 'nouvelle')).toBe(true)
	})

	test('une réponse ne se défait pas, et le spam ne devient pas « répondue » d’un coup', () => {
		expect(transitionPermise('repondue', 'transmise')).toBe(false)
		expect(transitionPermise('repondue', 'nouvelle')).toBe(false)
		expect(transitionPermise('transmise', 'nouvelle')).toBe(false)
		expect(transitionPermise('spam', 'repondue')).toBe(false)
		expect(transitionPermise('spam', 'transmise')).toBe(false)
	})

	test('rester où l’on est est toujours permis', () => {
		for (const statut of STATUTS_DE_DEMANDE) expect(transitionPermise(statut, statut)).toBe(true)
	})
})

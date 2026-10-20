import { describe, expect, test } from 'bun:test'
import { estUnStatutDeDemande, STATUTS_DE_DEMANDE, transitionPermise } from '@/lib/contact/states'

/**
 * U78, reduced to the contact message (ticket 163): `new` → `forwarded` → `answered`, and `spam`.
 * `conclue` and `perdue` of the plan belong to the requests to a makeup artist, which have no ticket yet.
 */
describe('U78 : le cycle des statuts d’un message de contact', () => {
	test('les statuts sont ceux du cycle, et aucun autre', () => {
		expect([...STATUTS_DE_DEMANDE]).toEqual(['new', 'forwarded', 'answered', 'spam'])
		expect(estUnStatutDeDemande('spam')).toBe(true)
		expect(estUnStatutDeDemande('conclue')).toBe(false)
		expect(estUnStatutDeDemande(undefined)).toBe(false)
	})

	test('le message avance : nouvelle, transmise, répondue', () => {
		expect(transitionPermise('new', 'forwarded')).toBe(true)
		expect(transitionPermise('forwarded', 'answered')).toBe(true)
	})

	test('un admin peut répondre à un message dont l’email a échoué : il l’a lu dans l’administration', () => {
		expect(transitionPermise('new', 'answered')).toBe(true)
	})

	test('le spam se marque depuis tous les statuts, et se défait vers « nouvelle »', () => {
		for (const de of ['new', 'forwarded', 'answered'] as const) expect(transitionPermise(de, 'spam')).toBe(true)
		expect(transitionPermise('spam', 'new')).toBe(true)
	})

	test('une réponse ne se défait pas, et le spam ne devient pas « répondue » d’un coup', () => {
		expect(transitionPermise('answered', 'forwarded')).toBe(false)
		expect(transitionPermise('answered', 'new')).toBe(false)
		expect(transitionPermise('forwarded', 'new')).toBe(false)
		expect(transitionPermise('spam', 'answered')).toBe(false)
		expect(transitionPermise('spam', 'forwarded')).toBe(false)
	})

	test('rester où l’on est est toujours permis', () => {
		for (const statut of STATUTS_DE_DEMANDE) expect(transitionPermise(statut, statut)).toBe(true)
	})
})

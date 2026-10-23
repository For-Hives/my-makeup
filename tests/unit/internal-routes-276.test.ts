import { describe, expect, test } from 'bun:test'
import { NextRequest } from 'next/server'
import { isClosedFirstAccountScreen } from '@/lib/auth/closed-first-account'
import { withoutInternalRoutes } from '@/lib/payload-internal-routes'
import { proxy } from '@/proxy'

/** Ticket 276 (audit 21/10/2026, m8 and m9): Payload's internal routes answer nothing useful. */

describe('/admin/create-first-user : la création du premier compte est fermée', () => {
	test.each(['/admin/create-first-user', '/admin/create-first-user/'])('%s est reconnue', chemin => {
		expect(isClosedFirstAccountScreen(chemin)).toBe(true)
	})
	test.each(['/admin/login', '/admin', '/admin/create-first-user-x', '/auth/connexion'])('%s ne l’est pas', chemin => {
		expect(isClosedFirstAccountScreen(chemin)).toBe(false)
	})
	test('le proxy répond la page 404 du site, sans indexation', () => {
		const response = proxy(new NextRequest('https://my-makeup.fr/admin/create-first-user'))
		expect(response.headers.get('x-middleware-rewrite')).toContain('/unknown-page')
		expect(response.headers.get('x-robots-tag')).toBe('noindex')
	})
	test('la page de connexion de l’administration passe', () => {
		const response = proxy(new NextRequest('https://my-makeup.fr/admin/login'))
		expect(response.headers.get('x-middleware-rewrite')).toBeNull()
	})
})

describe('les routes internes de Payload : 404, sans adresse interne', () => {
	const internal = () =>
		Response.json({ message: 'Cannot GET https://0.0.0.0:3000/api/payload-migrations' }, { status: 501 })

	test('un 501 devient un 404 sans l’adresse du serveur', async () => {
		const response = await withoutInternalRoutes(async () => internal())(new Request('https://my-makeup.fr/x'))
		expect(response.status).toBe(404)
		expect(await response.text()).not.toContain('0.0.0.0')
	})
	test('toute autre réponse passe telle quelle', async () => {
		const response = await withoutInternalRoutes(async () => Response.json({ ok: true }, { status: 403 }))(
			new Request('https://my-makeup.fr/x')
		)
		expect(response.status).toBe(403)
	})
})

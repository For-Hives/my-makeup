import { describe, expect, test } from 'bun:test'
import { NextRequest } from 'next/server'
import { UPLOAD_MESSAGES, UPLOAD_REQUEST_SIZE_MAX } from '@/lib/photo-upload'
import { uploadRefusal } from '@/lib/upload-guard'
import { proxy } from '@/proxy'

/** Ticket 273: a send too big, or from nobody, is refused before its body is read. */

const ask = (chemin: string, methode: string, cookies: string[], longueur: string | null) =>
	uploadRefusal({ chemin, methode, cookies, longueur })

describe('uploadRefusal', () => {
	test('no session cookie: 403, whatever the length', () => {
		expect(ask('/api/media', 'POST', [], '10')?.status).toBe(403)
		expect(ask('/api/media/12', 'PATCH', ['other'], null)?.status).toBe(403)
	})

	test('a declared length past the request limit: 413 with the message of the size', () => {
		const refusal = ask('/api/media', 'POST', ['payload-token'], String(30 * 1024 * 1024))
		expect(refusal).toEqual({ status: 413, message: UPLOAD_MESSAGES.taille })
	})

	test('a length at the limit, an absent length, a garbled one: left to Payload', () => {
		expect(ask('/api/media', 'POST', ['payload-token'], String(UPLOAD_REQUEST_SIZE_MAX))).toBeUndefined()
		expect(ask('/api/media', 'POST', ['payload-token'], null)).toBeUndefined()
		expect(ask('/api/media', 'POST', ['payload-token'], 'abc')).toBeUndefined()
	})

	test('other routes and reads are not concerned', () => {
		expect(ask('/api/media', 'GET', [], null)).toBeUndefined()
		expect(ask('/api/media', 'DELETE', [], null)).toBeUndefined()
		expect(ask('/api/profiles', 'POST', [], '999999999')).toBeUndefined()
		expect(ask('/api/mediaX', 'POST', [], null)).toBeUndefined()
	})
})

describe('the proxy', () => {
	const post = (headers: Record<string, string>) =>
		proxy(new NextRequest('https://my-makeup.fr/api/media?depth=0', { method: 'POST', headers }))

	test('an anonymous POST to the media route answers 403 in JSON', async () => {
		const response = post({ 'content-length': '5' })
		expect(response.status).toBe(403)
		expect(((await response.json()) as { errors: unknown[] }).errors).toHaveLength(1)
	})

	test('a POST declaring 30 MiB answers 413 with the French message', async () => {
		const response = post({ cookie: 'payload-token=x', 'content-length': String(30 * 1024 * 1024) })
		expect(response.status).toBe(413)
		expect(await response.text()).toContain(UPLOAD_MESSAGES.taille)
	})

	test('a POST of a normal size with a session passes', () => {
		const response = post({ cookie: 'payload-token=x', 'content-length': '2048' })
		expect(response.status).toBe(200)
		expect(response.headers.has('x-middleware-next')).toBe(true)
	})
})

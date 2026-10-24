import { describe, expect, test } from 'bun:test'
import { act } from 'react'
import { MESSAGES_PHOTO } from '@/lib/dashboard/photo'
import type { DashboardPhoto } from '@/lib/dashboard/photos'
import { UNCERTAIN_RESULT_MESSAGE } from '@/lib/dashboard/photos-upload'
import { FAILURE_MESSAGE, MESSAGE_SESSION } from '@/lib/dashboard/result'
import type { PhotoUsageView } from '@/lib/photo-limits'
import { benchOf, EMPTY } from '../support/direct-edit-bench'
import { openWindow } from '../support/dom-react'
import { pickFiles } from '../support/pick-files'

const window_ = openWindow()
const doc = () => window_.w.document
const alerts = () => [...doc().querySelectorAll('[role="alert"]')].map(alert => alert.textContent).join('|')
const photo = (id: number, alt = ''): DashboardPhoto => ({
	id,
	url: `https://photos.example.test/media/${id}.webp`,
	largeur: 400,
	hauteur: 500,
	alt,
})
const GALLERY = [photo(11, 'Mariée en lumière du jour'), photo(12), photo(13)]
const PREPARED = new File(['petit'], 'photo.webp', { type: 'image/webp' })
const ready = async () => ({ ok: true as const, fichier: PREPARED, largeur: 400, hauteur: 400, taille: 5 })
const field = () => doc().querySelector<HTMLInputElement>('input[type="file"]') as HTMLInputElement
const open = async (options: Parameters<typeof benchOf>[1] = {}) => {
	const bench = benchOf(window_, { gallery: GALLERY, ...options })
	await bench.mount()
	await window_.cliquer(window_.bouton('Modifier mon portfolio'))
	return bench
}

/**
 * What the old panel of the portfolio kept and the block of the edit mode did not yet say in a test (tickets 135, 136
 * and 309, moved by issue 1074): a failed upload takes back what was sent, a lost answer takes back nothing and the retry
 * does not send the file twice, and the volume used and the photos left are said before the send.
 */

describe('un enregistrement qui échoue', () => {
	test('coupure pendant l’envoi de la 2e : la 1re est reprise, rien n’est nommé, l’éditeur garde les choix', async () => {
		const removed: unknown[] = []
		let n = 0
		const bench = await open({
			galleryWork: {
				prepare: ready,
				upload: async () =>
					++n === 2 ? { ok: false, message: MESSAGES_PHOTO['envoi-impossible'] } : { ok: true, id: 101 },
				remove: async id => {
					removed.push(id)
				},
			},
		})
		await pickFiles(window_, field(), [
			new File(['a'], 'a.webp', { type: 'image/webp' }),
			new File(['b'], 'b.webp', { type: 'image/webp' }),
		])
		await window_.attendre(() => doc().querySelectorAll('[data-photo]').length === 5 || null)
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => alerts().includes(MESSAGES_PHOTO['envoi-impossible']) || null)
		expect(bench.calls.savePortfolio).toBeUndefined()
		expect(removed).toEqual([101])
		expect(doc().querySelectorAll('[data-photo]')).toHaveLength(5)
	})

	test('une réponse perdue : rien n’est repris ; un nouvel essai nomme sans renvoyer le fichier déjà envoyé', async () => {
		const removed: unknown[] = []
		let uploads = 0
		let attempt = 0
		const bench = await open({
			actions: {
				savePortfolio: async input => {
					if (++attempt === 1) throw new Error('Failed to fetch')
					return { ok: true, valeurs: input }
				},
			},
			galleryWork: {
				prepare: ready,
				upload: async () => {
					uploads++
					return { ok: true, id: 99 }
				},
				remove: async id => {
					removed.push(id)
				},
			},
		})
		await pickFiles(window_, field(), [new File(['x'], 'a.webp', { type: 'image/webp' })])
		await window_.attendre(() => doc().querySelectorAll('[data-photo]').length === 4 || null)
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => alerts().includes(UNCERTAIN_RESULT_MESSAGE) || null)
		expect(removed).toEqual([])
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => bench.refreshes || null)
		expect(uploads).toBe(1)
	})
})

describe('ticket 309 : le volume utilisé et les photos restantes, dits avant l’envoi', () => {
	const MIB = 1024 * 1024
	const usage = (count: number, bytes = 12.3 * MIB): PhotoUsageView => ({
		count,
		bytes,
		countMax: 45,
		bytesMax: 60 * MIB,
	})
	const named = (...names: string[]) => names.map(name => new File([name], name, { type: 'image/webp' }))

	test('l’éditeur dit le volume pris et combien de photos il reste', async () => {
		await open({ usage: usage(14) })
		expect(doc().body.textContent).toContain('Tes photos prennent 12,3 Mo sur 60 Mo. Il te reste 31 photos.')
	})

	test('à la limite du profil : une photo choisie est refusée sans être préparée ni envoyée', async () => {
		const prepared: string[] = []
		await open({
			usage: usage(44),
			galleryWork: {
				prepare: async file => {
					prepared.push(file.name)
					return ready()
				},
			},
		})
		await pickFiles(window_, field(), named('a.webp', 'b.webp'))
		await window_.attendre(() => alerts().includes('b.webp') || null)
		// 44 of 45 photos: the first fits, the second is refused before the browser works on it.
		expect(alerts()).toContain(`b.webp : ${MESSAGES_PHOTO['limite-profil']}`)
		expect(alerts()).not.toContain('a.webp :')
		expect(prepared).toEqual(['a.webp'])
	})

	test('au-dessus de la limite : la phrase l’annonce, aucune photo n’est ajoutée', async () => {
		const prepared: string[] = []
		await open({
			usage: usage(50, 70 * MIB),
			galleryWork: {
				prepare: async file => {
					prepared.push(file.name)
					return ready()
				},
			},
		})
		expect(doc().body.textContent).toContain('Tu as atteint la limite')
		await pickFiles(window_, field(), named('a.webp'))
		await window_.attendre(() => alerts().includes('a.webp') || null)
		expect(prepared).toEqual([])
	})
})

import { describe, expect, test } from 'bun:test'
import { describeReconciliation, type ReadMedia, reconcile } from '@/lib/reconciliation'

/** The dry reconciliation of the storage and the database (ticket 137; plan 02 I27). */

const object = (cle: string) => ({ cle, taille: 10 })
const media = (id: number, filename: string, extra: Partial<ReadMedia> = {}): ReadMedia => ({
	id,
	prefix: 'media',
	filename,
	...extra,
})

describe('I27 : les orphelins sont nommés exactement', () => {
	test('un stockage et une base d’accord : 0 orphelin', () => {
		const report = reconcile({
			objets: [object('media/a.webp'), object('media/a-500.webp')],
			medias: [media(1, 'a.webp', { sizes: { small: { filename: 'a-500.webp' } } })],
			mediasUtilises: new Set(['1']),
		})
		expect(report.sansOrphelin).toBe(true)
		expect(report.comptes).toMatchObject({ objets: 2, medias: 1, mediasUtilises: 1, objetsAttendus: 2 })
	})

	test('les trois sortes d’orphelins, et la corbeille comptée à part', () => {
		const report = reconcile({
			objets: [
				object('media/a.webp'),
				object('media/seul.webp'),
				object('media/sans-profil.webp'),
				object('deleted/media/ancien.webp'),
			],
			medias: [
				media(1, 'a.webp'),
				media(2, 'manquant.webp', { sizes: { small: { filename: 'm-500.webp' } } }),
				media(3, 'sans-profil.webp'),
			],
			mediasUtilises: new Set(['1', '2']),
		})
		expect(report.objetsSansMedia).toEqual(['media/seul.webp'])
		expect(report.mediasSansObjet).toEqual([{ id: '2', cles: ['media/m-500.webp', 'media/manquant.webp'] }])
		expect(report.mediasSansProfil).toEqual(['3'])
		expect(report.comptes).toMatchObject({ objets: 4, objetsEnCorbeille: 1, objetsHorsCorbeille: 3 })
		expect(report.sansOrphelin).toBe(false)
	})

	test('un média de l’ancien site à la racine ou sous son préfixe est reconnu par sa clé', () => {
		const report = reconcile({
			objets: [object('photo_a.jpg'), object('1/photo_b.jpg')],
			medias: [media(1, 'photo_a.jpg', { prefix: '' }), media(2, 'photo_b.jpg', { prefix: '1' })],
			mediasUtilises: new Set(['1', '2']),
		})
		expect(report.sansOrphelin).toBe(true)
	})

	test('les vignettes de l’ancien site sont comptées à part, pas des orphelines', () => {
		const report = reconcile({
			objets: [object('photo_a.jpg'), object('thumbnail_photo_a.jpg'), object('autre.jpg')],
			medias: [
				media(1, 'photo_a.jpg', {
					prefix: '',
					strapiFormats: { thumbnail: { url: 'https://photos.exemple.test/thumbnail_photo_a.jpg' } },
				}),
			],
			mediasUtilises: new Set(['1']),
		})
		expect(report.comptes.vignettesAnciennes).toBe(1)
		expect(report.objetsSansMedia).toEqual(['autre.jpg'])
	})

	test('un média adopté de l’ancien site est listé, mais ne compte pas « hors import » ; un média de la v3 compte toujours', () => {
		const adopted = media(1, 'vieux.jpg', { prefix: '', strapiId: 7 })
		const objects = [object('media/neuf.webp')]
		const onImport = reconcile({ objets: [], medias: [adopted], mediasUtilises: new Set() })
		expect(onImport).toMatchObject({
			sansOrphelin: false,
			sansOrphelinHorsImport: true,
			importes: ['1'],
			mediasSansObjet: [{ id: '1', cles: ['vieux.jpg'] }],
			mediasSansProfil: ['1'],
		})
		const onNew = reconcile({ objets: objects, medias: [media(2, 'autre.webp')], mediasUtilises: new Set() })
		expect(onNew.sansOrphelinHorsImport).toBe(false)
		expect(onNew.importes).toEqual([])
		// A stray object is never excused by the import.
		expect(
			reconcile({ objets: objects, medias: [adopted], mediasUtilises: new Set(['1']) }).sansOrphelinHorsImport
		).toBe(false)
	})

	test('la sortie ne porte que des clés, des identifiants et des comptes', () => {
		const text = describeReconciliation(
			reconcile({ objets: [object('media/seul.webp')], medias: [media(5, 'x.webp')], mediasUtilises: new Set() })
		)
		expect(text).toContain('media/seul.webp')
		expect(text).toContain('média 5 : media/x.webp')
		expect(text).toContain('Orphelins trouvés : rien n’a été supprimé.')
	})
})

import { describe, expect, test } from 'bun:test'
import { describeReconciliation, type ReadMedia, reconcile } from '@/lib/reconciliation'

/** The dry reconciliation of the storage and the database (ticket 137; plan 02 I27). */

const objet = (cle: string) => ({ cle, taille: 10 })
const media = (id: number, filename: string, extra: Partial<ReadMedia> = {}): ReadMedia => ({
	id,
	prefix: 'media',
	filename,
	...extra,
})

describe('I27 : les orphelins sont nommés exactement', () => {
	test('un stockage et une base d’accord : 0 orphelin', () => {
		const rapport = reconcile({
			objets: [objet('media/a.webp'), objet('media/a-500.webp')],
			medias: [media(1, 'a.webp', { sizes: { small: { filename: 'a-500.webp' } } })],
			mediasUtilises: new Set(['1']),
		})
		expect(rapport.sansOrphelin).toBe(true)
		expect(rapport.comptes).toMatchObject({ objets: 2, medias: 1, mediasUtilises: 1, objetsAttendus: 2 })
	})

	test('les trois sortes d’orphelins, et la corbeille comptée à part', () => {
		const rapport = reconcile({
			objets: [
				objet('media/a.webp'),
				objet('media/seul.webp'),
				objet('media/sans-profil.webp'),
				objet('deleted/media/ancien.webp'),
			],
			medias: [
				media(1, 'a.webp'),
				media(2, 'manquant.webp', { sizes: { small: { filename: 'm-500.webp' } } }),
				media(3, 'sans-profil.webp'),
			],
			mediasUtilises: new Set(['1', '2']),
		})
		expect(rapport.objetsSansMedia).toEqual(['media/seul.webp'])
		expect(rapport.mediasSansObjet).toEqual([{ id: '2', cles: ['media/m-500.webp', 'media/manquant.webp'] }])
		expect(rapport.mediasSansProfil).toEqual(['3'])
		expect(rapport.comptes).toMatchObject({ objets: 4, objetsEnCorbeille: 1, objetsHorsCorbeille: 3 })
		expect(rapport.sansOrphelin).toBe(false)
	})

	test('un média de l’ancien site à la racine ou sous son préfixe est reconnu par sa clé', () => {
		const rapport = reconcile({
			objets: [objet('photo_a.jpg'), objet('1/photo_b.jpg')],
			medias: [media(1, 'photo_a.jpg', { prefix: '' }), media(2, 'photo_b.jpg', { prefix: '1' })],
			mediasUtilises: new Set(['1', '2']),
		})
		expect(rapport.sansOrphelin).toBe(true)
	})

	test('les vignettes de l’ancien site sont comptées à part, pas des orphelines', () => {
		const rapport = reconcile({
			objets: [objet('photo_a.jpg'), objet('thumbnail_photo_a.jpg'), objet('autre.jpg')],
			medias: [
				media(1, 'photo_a.jpg', {
					prefix: '',
					strapiFormats: { thumbnail: { url: 'https://photos.exemple.test/thumbnail_photo_a.jpg' } },
				}),
			],
			mediasUtilises: new Set(['1']),
		})
		expect(rapport.comptes.vignettesAnciennes).toBe(1)
		expect(rapport.objetsSansMedia).toEqual(['autre.jpg'])
	})

	test('un média adopté de l’ancien site est listé, mais ne compte pas « hors import » ; un média de la v3 compte toujours', () => {
		const adopte = media(1, 'vieux.jpg', { prefix: '', strapiId: 7 })
		const objets = [objet('media/neuf.webp')]
		const surImport = reconcile({ objets: [], medias: [adopte], mediasUtilises: new Set() })
		expect(surImport).toMatchObject({
			sansOrphelin: false,
			sansOrphelinHorsImport: true,
			importes: ['1'],
			mediasSansObjet: [{ id: '1', cles: ['vieux.jpg'] }],
			mediasSansProfil: ['1'],
		})
		const surNeuf = reconcile({ objets, medias: [media(2, 'autre.webp')], mediasUtilises: new Set() })
		expect(surNeuf.sansOrphelinHorsImport).toBe(false)
		expect(surNeuf.importes).toEqual([])
		// A stray object is never excused by the import.
		expect(reconcile({ objets, medias: [adopte], mediasUtilises: new Set(['1']) }).sansOrphelinHorsImport).toBe(false)
	})

	test('la sortie ne porte que des clés, des identifiants et des comptes', () => {
		const texte = describeReconciliation(
			reconcile({ objets: [objet('media/seul.webp')], medias: [media(5, 'x.webp')], mediasUtilises: new Set() })
		)
		expect(texte).toContain('media/seul.webp')
		expect(texte).toContain('média 5 : media/x.webp')
		expect(texte).toContain('Orphelins trouvés : rien n’a été supprimé.')
	})
})

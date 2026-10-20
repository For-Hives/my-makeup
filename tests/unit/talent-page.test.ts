import { describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { validerTitreDeLaPage } from '@/collections/Talents'
import { metadonneesEditoriales } from '@/lib/seo/metadonnees'
import { TITRE_MAX, TITRE_MIN_DES_TALENTS } from '@/lib/seo/texte'
import { TALENT_PAGE_FIELDS, readTalent } from '@/services/public/talents'

/**
 * The page of a talent without a database (ticket 108): what its reading asks for, the title of the page the
 * newsroom writes (50 to 60 characters, different from the h1), and the metadata that title feeds. The runs
 * against the bench: tests/e2e/talent.spec.ts.
 */

function payloadEspion(docs: Record<string, unknown>[]) {
	const lectures: Record<string, unknown>[] = []
	const payload = {
		find: async (options: Record<string, unknown>) => {
			lectures.push(options)
			return { docs }
		},
	} as unknown as Payload
	return { payload, lectures }
}

const TALENT = {
	slug: 'maquillage-fictif',
	title: 'Maquillage fictif',
	seo_title: ' Un maquillage fictif pour les fêtes ',
	titreDeLaPage: null,
	description: null,
	seo_description: undefined,
	content: null,
}

describe('lireLeTalent : la lecture publique d’un talent', () => {
	test('elle choisit ses champs, garde les règles d’accès et se borne à un document', async () => {
		const { payload, lectures } = payloadEspion([TALENT])
		await readTalent(payload, 'maquillage-fictif')
		expect(lectures).toHaveLength(1)
		expect(lectures[0]).toMatchObject({
			collection: 'talents',
			where: { slug: { equals: 'maquillage-fictif' } },
			select: TALENT_PAGE_FIELDS,
			overrideAccess: false,
			limit: 1,
			depth: 0,
		})
	})

	test('les champs lus sont figés : ni identifiant de l’ancien site, ni état de brouillon', () => {
		expect(Object.keys(TALENT_PAGE_FIELDS).sort()).toEqual(
			['content', 'description', 'seo_description', 'seo_title', 'slug', 'title', 'pageTitle'].sort()
		)
	})

	test('le h1 est le titre « seo_title » rogné, le titre du talent à défaut ; un champ jamais rempli est vide', async () => {
		const { payload } = payloadEspion([TALENT])
		expect(await readTalent(payload, 'maquillage-fictif')).toEqual({
			slug: 'maquillage-fictif',
			titre: 'Maquillage fictif',
			titreAffiche: 'Un maquillage fictif pour les fêtes',
			titreDeLaPage: '',
			presentation: '',
			descriptionSeo: '',
			contenu: '',
		})
		const sansSeo = payloadEspion([{ ...TALENT, seo_title: 'null' }])
		expect((await readTalent(sansSeo.payload, 'maquillage-fictif'))?.titreAffiche).toBe('Maquillage fictif')
	})

	test('un brouillon ou un inconnu : null ; une adresse qui n’est pas un slug ne touche pas la base', async () => {
		expect(await readTalent(payloadEspion([]).payload, 'inconnu')).toBeNull()
		const { payload, lectures } = payloadEspion([TALENT])
		for (const mauvais of ['', 'Maquillage Fictif', '../etc']) expect(await readTalent(payload, mauvais)).toBeNull()
		expect(lectures).toHaveLength(0)
	})
})

/** What Payload hands to a validation: only what the text validation reads. */
const arguments_ = (seoTitle?: string) =>
	({
		required: false,
		siblingData: { seo_title: seoTitle },
		req: { payload: { config: {} }, t: (cle: string) => cle },
	}) as never

describe('validerTitreDeLaPage : de 50 à 60 caractères, différent du h1', () => {
	const de = (n: number) => `${'Titre '.repeat(20)}`.slice(0, n).trim().padEnd(n, 'x')

	test('vide : accepté, la page garde le titre du site actuel', () => {
		for (const vide of [undefined, null, '', '   ']) expect(validerTitreDeLaPage(vide, arguments_())).toBe(true)
	})

	test('50 à 60 caractères : accepté', () => {
		for (const n of [TITRE_MIN_DES_TALENTS, 55, TITRE_MAX])
			expect(validerTitreDeLaPage(de(n), arguments_()), String(n)).toBe(true)
	})

	test('49 ou 61 caractères : refusé, avec la longueur dite', () => {
		for (const n of [49, 61, 10]) {
			const message = validerTitreDeLaPage(de(n), arguments_())
			expect(message).toContain(`de ${TITRE_MIN_DES_TALENTS} à ${TITRE_MAX} caractères`)
			expect(message).toContain(`en compte ${n}`)
		}
	})

	test('identique au h1 : refusé', () => {
		const titre = de(55)
		expect(validerTitreDeLaPage(titre, arguments_(titre))).toContain('différent')
		expect(validerTitreDeLaPage(titre, arguments_(`${titre.slice(1)}z`))).toBe(true)
	})
})

describe('les métadonnées d’un talent', () => {
	const entrees = {
		descriptionRedigee: '',
		autres: ['Une présentation écrite pour l’essai, assez longue pour dépasser les soixante-dix caractères.'],
		repli: 'Un texte de repli.',
		chemin: '/talent/maquillage-fictif',
	}

	test('le titre écrit par la rédaction est repris tel quel, sans la marque : il fait déjà 50 à 60 caractères', () => {
		const titre = 'Maquillage fictif : trouvez une maquilleuse près de chez vous'.slice(0, 58)
		const meta = metadonneesEditoriales({ ...entrees, titre })
		expect(meta.title).toEqual({ absolute: titre })
		expect(titre.length).toBeGreaterThanOrEqual(TITRE_MIN_DES_TALENTS)
	})

	test('sans lui, le titre court du talent suivi du nom du site, comme aujourd’hui', () => {
		expect(metadonneesEditoriales({ ...entrees, titre: 'Maquillage fictif' }).title).toEqual({
			absolute: 'Maquillage fictif | My-Makeup',
		})
	})

	test('la description et l’adresse canonique', () => {
		const meta = metadonneesEditoriales({ ...entrees, titre: 'x' })
		expect(meta.description).toStartWith('Une présentation écrite pour l’essai')
		expect(meta.alternates?.canonical).toBe('https://my-makeup.fr/talent/maquillage-fictif')
	})
})

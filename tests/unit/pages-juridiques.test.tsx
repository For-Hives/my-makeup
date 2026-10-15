import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { OppositionMesure } from '@/components/analytics/OppositionMesure'
import { COLONNES_DE_PIED } from '@/components/gabarit/liens'
import { CLE_D_OPPOSITION, mesureRefusee, refuserLaMesure } from '@/lib/analytics/opposition'
import { EDITEUR, formatSiren, formatSiret, HEBERGEUR, luhnValid } from '@/lib/legal'
import { ouvrirFenetre } from '../outils/dom-react'
import { empreinteDuTexte, texteDePage } from '../outils/texte-de-page'

/**
 * The three legal pages (ticket 112): the text of the live site word for word, one h1, one source for
 * the legal identity, and the button that lets a visitor oppose the audience measure. The same pages
 * in a browser, with the fake Umami: tests/e2e/pages-juridiques.spec.ts.
 */

const PAGES = [
	{ chemin: '/mentions-legales', module: () => import('@/app/(front)/(site)/mentions-legales/page') },
	{ chemin: '/cgu', module: () => import('@/app/(front)/(site)/cgu/page') },
	{
		chemin: '/politique-de-confidentialite',
		module: () => import('@/app/(front)/(site)/politique-de-confidentialite/page'),
	},
] as const

// The words of the live site, as the hash of their plain text (the text itself is the page's). The one
// wanted difference: the paragraph « Formulaire de contact » of the policy (ticket 162, register
// `contact-conservation-12-mois`).
const EN_LIGNE: Record<string, { lignes: number; sha: string }> = JSON.parse(
	readFileSync(path.join(process.cwd(), 'tests/fixtures/pages-juridiques-texte.json'), 'utf8')
)

describe('le texte des trois pages', () => {
	for (const { chemin, module } of PAGES) {
		test(`${chemin} : texte brut identique à celui du site en ligne, un seul h1`, async () => {
			const { default: Page } = await module()
			const html = renderToStaticMarkup(<Page />)
			const texte = texteDePage(html)

			expect(texte.split('\n').length).toBe(EN_LIGNE[chemin]?.lignes as number)
			expect(empreinteDuTexte(texte)).toBe(EN_LIGNE[chemin]?.sha as string)
			expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
		})

		test(`${chemin} : titre, description et adresse canonique`, async () => {
			const { metadata } = await module()
			const description = String(metadata.description)

			expect(String((metadata.title as { absolute: string }).absolute)).toMatch(/ \| My-Makeup$/)
			expect(description.length).toBeGreaterThanOrEqual(70)
			expect(description.length).toBeLessThanOrEqual(155)
			expect(metadata.alternates?.canonical).toBe(`https://my-makeup.fr${chemin}`)
			expect(metadata.robots).toBeUndefined()
		})
	}

	test('seule la politique mène au bouton d’opposition', async () => {
		const texte = async (module: () => Promise<{ default: () => React.JSX.Element }>) => {
			const { default: Page } = await module()
			return texteDePage(renderToStaticMarkup(<Page />))
		}

		// The button itself draws nothing on the server: the page shows the sentence that leads to it.
		expect(await texte(PAGES[2].module)).toContain('Vous pouvez vous y opposer sur ce navigateur :')
		expect(await texte(PAGES[1].module)).not.toContain('opposer')
		expect(await texte(PAGES[0].module)).not.toContain('opposer')
	})

	test('le pied de page mène aux trois pages', () => {
		const liens = COLONNES_DE_PIED.flatMap(({ liens }) => liens.map(({ href }) => href))
		for (const { chemin } of PAGES) expect(liens).toContain(chemin)
	})
})

describe('l’identité légale vient d’une seule source', () => {
	test('les numéros sont valides et s’impriment à la française', () => {
		expect(luhnValid(EDITEUR.siren)).toBe(true)
		expect(luhnValid(EDITEUR.siret)).toBe(true)
		expect(EDITEUR.siret.startsWith(EDITEUR.siren)).toBe(true)
		expect(formatSiren(EDITEUR.siren)).toMatch(/^\d{3} \d{3} \d{3}$/)
		expect(formatSiret(EDITEUR.siret)).toMatch(/^\d{3} \d{3} \d{3} \d{5}$/)
		expect(formatSiret(EDITEUR.siret).replaceAll(' ', '')).toBe(EDITEUR.siret)
		expect(luhnValid('12a')).toBe(false)
	})

	test('les pages les écrivent depuis cette source : ni numéro ni adresse dans leur code', () => {
		const sources = readdirSync(path.join(process.cwd(), 'src/app/(front)/(site)'), {
			recursive: true,
			withFileTypes: true,
		})
			.filter(entree => entree.isFile() && /\.tsx?$/.test(entree.name))
			.map(entree => readFileSync(path.join(entree.parentPath, entree.name), 'utf8'))
		const valeurs = [
			EDITEUR.siren,
			EDITEUR.siret,
			EDITEUR.adresse,
			EDITEUR.telephone,
			HEBERGEUR.adresse,
			HEBERGEUR.telephone,
		]
		for (const source of sources) for (const valeur of valeurs) expect(source).not.toContain(valeur)
	})

	test('la page des mentions écrit l’éditeur et l’hébergeur tels que la source les donne', async () => {
		const { default: Page } = await PAGES[0].module()
		const texte = texteDePage(renderToStaticMarkup(<Page />))

		for (const ligne of [
			`SIREN : ${formatSiren(EDITEUR.siren)}`,
			`SIRET : ${formatSiret(EDITEUR.siret)}`,
			`Adresse : ${EDITEUR.adresse}`,
			`Email : ${EDITEUR.email}`,
			`Téléphone : ${EDITEUR.telephone}`,
			HEBERGEUR.adresse,
			`Téléphone : ${HEBERGEUR.telephone}`,
		])
			expect(texte).toContain(ligne)
		expect(texte).toContain(`édité par ${EDITEUR.nom}, ${EDITEUR.forme}.`)
	})
})

describe('l’opposition à la mesure', () => {
	const fenetre = ouvrirFenetre({ noms: ['localStorage'] })

	test('un clic coupe la mesure sur ce navigateur, un second la rétablit', async () => {
		fenetre.w.localStorage.clear()
		const zone = await fenetre.monter(<OppositionMesure />)
		const etat = () => zone.querySelector('[role="status"]')?.textContent

		expect(etat()).toBe("La mesure d'audience est active sur ce navigateur.")
		expect(fenetre.w.localStorage.getItem(CLE_D_OPPOSITION)).toBeNull()

		await fenetre.cliquer(fenetre.bouton('Ne plus mesurer mes visites'))
		expect(fenetre.w.localStorage.getItem(CLE_D_OPPOSITION)).not.toBeNull()
		expect(etat()).toBe("La mesure d'audience est désactivée sur ce navigateur.")

		await fenetre.cliquer(fenetre.bouton("Réactiver la mesure d'audience"))
		expect(fenetre.w.localStorage.getItem(CLE_D_OPPOSITION)).toBeNull()
		expect(etat()).toBe("La mesure d'audience est active sur ce navigateur.")
	})

	test('une opposition déjà posée se lit à l’ouverture de la page', async () => {
		fenetre.w.localStorage.setItem(CLE_D_OPPOSITION, '1')
		const zone = await fenetre.monter(<OppositionMesure />)
		await fenetre.attendre(() => zone.querySelector('button'))

		expect(zone.querySelector('[role="status"]')?.textContent).toBe(
			"La mesure d'audience est désactivée sur ce navigateur."
		)
		expect(fenetre.bouton("Réactiver la mesure d'audience")).toBeTruthy()
		fenetre.w.localStorage.clear()
	})
})

describe('la clé d’opposition', () => {
	const memoire = () => {
		const valeurs = new Map<string, string>()
		return {
			getItem: (cle: string) => valeurs.get(cle) ?? null,
			setItem: (cle: string, valeur: string) => void valeurs.set(cle, valeur),
			removeItem: (cle: string) => void valeurs.delete(cle),
		}
	}

	test('c’est la clé qu’Umami lit lui-même, et le filtre de la page la lit aussi', () => {
		expect(CLE_D_OPPOSITION).toBe('umami.disabled')
		const filtre = readFileSync(path.join(process.cwd(), 'src/lib/analytics/umami.ts'), 'utf8')
		expect(filtre).toContain(`getItem('${CLE_D_OPPOSITION}')`)
	})

	test('poser puis retirer la clé change l’état, et l’état se relit dans le stockage', () => {
		const stockage = memoire()
		expect(mesureRefusee(stockage)).toBe(false)
		expect(refuserLaMesure(stockage, true)).toBe(true)
		expect(mesureRefusee(stockage)).toBe(true)
		expect(refuserLaMesure(stockage, false)).toBe(false)
	})

	test('un stockage absent ou qui refuse ne casse rien et ne compte pas pour une opposition', () => {
		const casse = {
			getItem: () => {
				throw new Error('bloqué')
			},
			setItem: () => {
				throw new Error('bloqué')
			},
			removeItem: () => {
				throw new Error('bloqué')
			},
		}
		expect(mesureRefusee(undefined)).toBe(false)
		expect(mesureRefusee(casse)).toBe(false)
		expect(refuserLaMesure(casse, true)).toBe(false)
		expect(refuserLaMesure(undefined, true)).toBe(false)
	})
})

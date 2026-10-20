import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { installerLaMesure, scriptDeMesure } from '@/lib/analytics/chargeur'
import {
	aEmettre,
	CLE_SOUMISSION_DU_FORMULAIRE,
	empreinte,
	type Navigateur,
	noterLaSoumission,
	soumissionDuFormulaire,
} from '@/lib/analytics/doublon'
import { donneesDEvenement } from '@/lib/analytics/events'
import { pidDuProfil } from '@/lib/analytics/pid'
import { codeDErreur, genreDePageIntrouvable, trancheDeResultats } from '@/lib/analytics/valeurs'

/** Plan 04 §3.3, events 4, 5, 6, 8 and 21 (ticket 145): the values they send, and that nothing typed goes. */

function navigateurFictif(rechargement = false): Navigateur & { memoire: Map<string, string> } {
	const memoire = new Map<string, string>()
	return {
		memoire,
		lire: cle => memoire.get(cle) ?? null,
		ecrire: (cle, valeur) => void memoire.set(cle, valeur),
		supprimer: cle => void memoire.delete(cle),
		rechargement: () => rechargement,
	}
}

describe('la tranche de résultats : jamais le nombre', () => {
	test.each([
		[0, '0'],
		[1, '1-5'],
		[5, '1-5'],
		[6, '6-20'],
		[20, '6-20'],
		[21, '21+'],
		[4000, '21+'],
	] as const)('%i résultats : %s', (nombre, tranche) => {
		expect(trancheDeResultats(nombre)).toBe(tranche)
		expect(donneesDEvenement('search_submit', { has_city: true, results: tranche, from: 'lien' })).not.toBeNull()
	})
})

describe('la 404 : une valeur de la liste fermée, jamais l’adresse', () => {
	test.each([
		['/profil/zoe-fictive', 'profil'],
		['/talent/maquillage-mariee', 'talent'],
		['/blog/article-inconnu/encore', 'blog'],
		['/Blog/x', 'blog'],
		['/', 'autre'],
		['/cette-page-n-existe-pas', 'autre'],
		['/profilx/zoe', 'autre'],
		['/search?search=lea@example.test', 'autre'],
	] as const)('%s : %s', (chemin, genre) => {
		expect(genreDePageIntrouvable(chemin)).toBe(genre)
		expect(donneesDEvenement('not_found', { kind: genreDePageIntrouvable(chemin) })).toEqual({ kind: genre })
	})
})

describe('l’erreur : une portée et un code, jamais le message', () => {
	test('un script qui ne charge pas, une erreur de rendu, autre chose', () => {
		expect(codeDErreur(new Error('Loading chunk 123 failed'))).toBe('chunk_load')
		expect(codeDErreur(Object.assign(new Error('x'), { name: 'ChunkLoadError' }))).toBe('chunk_load')
		expect(codeDErreur(new Error('Cannot read properties of undefined (reading "nom")'))).toBe('render')
		expect(codeDErreur('texte')).toBe('unknown')
		expect(codeDErreur(null)).toBe('unknown')
	})

	test('le code d’une erreur dont le message est personnel reste dans la liste', () => {
		const code = codeDErreur(new Error('Échec pour lea@example.test 0612345678'))
		expect(donneesDEvenement('app_error', { scope: 'site', code })).toEqual({ scope: 'site', code })
	})
})

describe('le profil d’un résultat', () => {
	test('l’id de l’ancien site s’il existe, sinon v3-<id>', () => {
		expect(pidDuProfil({ id: 9, strapiId: 120 })).toBe(120)
		expect(pidDuProfil({ id: 9, strapiId: null })).toBe('v3-9')
		expect(pidDuProfil({ id: 9 })).toBe('v3-9')
		expect(pidDuProfil({ id: 9, strapiId: 0 })).toBe('v3-9')
		expect(donneesDEvenement('search_result_click', { rank: 21, pid: pidDuProfil({ id: 9 }) })).toEqual({
			rank: 21,
			pid: 'v3-9',
		})
	})
})

describe('aucun doublon', () => {
	test('la 404 rechargée n’est pas comptée deux fois ; une autre adresse, ou une navigation, l’est', () => {
		const premier = navigateurFictif()
		expect(aEmettre('not_found', '/zzz', 'rechargement', premier)).toBe(true)
		// Same tab, the browser reloaded the page.
		const recharge = { ...premier, rechargement: () => true }
		expect(aEmettre('not_found', '/zzz', 'rechargement', recharge)).toBe(false)
		expect(aEmettre('not_found', '/zzz', 'rechargement', recharge)).toBe(false)
		// Another dead address, then back to the first by a link (no reload): two more.
		expect(aEmettre('not_found', '/autre', 'rechargement', recharge)).toBe(true)
		expect(aEmettre('not_found', '/zzz', 'rechargement', premier)).toBe(true)
	})

	test('l’erreur : portée et événement comptent à part', () => {
		const navigateur = navigateurFictif(true)
		expect(aEmettre('app_error', 'site::/x', 'rechargement', navigateur)).toBe(true)
		expect(aEmettre('app_error', 'site::/x', 'rechargement', navigateur)).toBe(false)
		expect(aEmettre('app_error', 'espace::/x', 'rechargement', navigateur)).toBe(true)
	})

	test('la même recherche vue de nouveau (page 2, retour) n’est pas une nouvelle soumission', () => {
		const navigateur = navigateurFictif()
		const vue = empreinte('mariée|Annecy')
		expect(aEmettre('search_submit', vue, 'meme-vue', navigateur)).toBe(true)
		expect(aEmettre('search_submit', vue, 'meme-vue', navigateur)).toBe(false)
		expect(aEmettre('search_submit', empreinte('soirée|Annecy'), 'meme-vue', navigateur)).toBe(true)
	})

	test('le formulaire soumis se lit une seule fois', () => {
		const navigateur = navigateurFictif()
		expect(soumissionDuFormulaire(navigateur)).toBe(false)
		noterLaSoumission(navigateur)
		expect(navigateur.memoire.get(CLE_SOUMISSION_DU_FORMULAIRE)).toBe('1')
		expect(soumissionDuFormulaire(navigateur)).toBe(true)
		expect(soumissionDuFormulaire(navigateur)).toBe(false)
	})

	test('l’empreinte ne laisse pas lire les mots', () => {
		expect(empreinte('mariée|Annecy')).not.toContain('Annecy')
		expect(empreinte('a')).not.toBe(empreinte('b'))
		const navigateur = navigateurFictif()
		aEmettre('search_submit', 'lea@example.test|Annecy', 'meme-vue', navigateur)
		expect([...navigateur.memoire.values()].join('')).not.toMatch(/lea|Annecy|@/)
	})
})

describe('rien de saisi ne part : lecture du code', () => {
	const lire = (chemin: string) => readFileSync(new URL(`../../${chemin}`, import.meta.url), 'utf8')

	test('la page de recherche ne donne au navigateur que deux faits et une empreinte', () => {
		const page = lire('src/app/(front)/(site)/search/page.tsx')
		const balise = page.match(/<MesureDeRecherche[\s\S]*?\/>/)?.[0] ?? ''
		expect(balise).toContain("aUneVille={city !== ''}")
		expect(balise).toContain('trancheDeResultats(all.length)')
		expect(balise).toContain('empreinte(')
		expect(balise).not.toMatch(/search=\{search\}|city=\{city\}|recherche=/)
	})

	test('chaque page n’émet que par le chemin unique, et chaque événement du lot a son point d’émission', () => {
		const pages = lire('src/components/analytics/MesureDePage.tsx')
		for (const nom of ['search_submit', 'not_found', 'app_error']) expect(pages).toContain(`track('${nom}'`)
		const liens = lire('src/components/analytics/LienSuivi.tsx')
		for (const nom of ['cta_click', 'search_result_click']) expect(liens).toContain(`track('${nom}'`)
		expect(lire('src/components/blocs/Cta.tsx')).toContain("where: 'cta_recherche'")
		expect(lire('src/components/blocs/Cta.tsx')).toContain("where: 'cta_inscription'")
		expect(lire('src/components/gabarit/Nav.tsx')).toContain("nom: 'nav_recherche'")
		expect(lire('src/components/search/ResultCard.tsx')).toContain("nom: 'search_result_click'")
		expect(lire('src/app/(front)/(site)/not-found.tsx')).toContain('<MesureDePageIntrouvable />')
		expect(lire('src/app/(front)/(site)/error.tsx')).toContain('scope="site"')
		expect(lire('src/app/(front)/(dashboard)/auth/error.tsx')).toContain('scope="espace"')
		expect(lire('src/app/global-error.tsx')).toContain('scope="global"')
	})
})

describe('le traceur des pages qui l’ont perdu (404 d’une adresse inconnue, page d’erreur)', () => {
	const fenetre = (extra: Record<string, unknown> = {}) => {
		const ajoutes: { text: string }[] = []
		return {
			ajoutes,
			fenetre: {
				document: {
					head: { appendChild: (noeud: unknown) => ajoutes.push(noeud as { text: string }) },
					createElement: () => ({ text: '' }),
				},
				...extra,
			},
		}
	}

	test('il ajoute le script de l’en-tête, une fois, en production seulement', () => {
		const { fenetre: f, ajoutes } = fenetre()
		expect(installerLaMesure(f, false)).toBe(false)
		expect(ajoutes).toHaveLength(0)
		expect(installerLaMesure(f, true)).toBe(true)
		expect(ajoutes[0]?.text).toBe(scriptDeMesure())
		expect(ajoutes[0]?.text).toContain('mmAttenteUmami')
		expect(ajoutes[0]?.text).toContain('/u/script.js')
	})

	test('il ne fait rien si le traceur ou sa salle d’attente est là, ou sans page', () => {
		const avecSalle = fenetre({ mmAttenteUmami: () => true })
		expect(installerLaMesure(avecSalle.fenetre, true)).toBe(false)
		const avecUmami = fenetre({ umami: { track: () => undefined } })
		expect(installerLaMesure(avecUmami.fenetre, true)).toBe(false)
		expect(installerLaMesure(undefined, true)).toBe(false)
		expect(avecSalle.ajoutes.length + avecUmami.ajoutes.length).toBe(0)
	})
})

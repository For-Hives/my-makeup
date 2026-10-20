import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { VueDuProfil } from '@/components/profile/VueDuProfil'
import { clicAMesurer, mesurerUnClicDeContact } from '@/lib/analytics/contact-click'
import type { Pid } from '@/lib/analytics/events'
import { creerTrack, type Execution, type FenetreMesuree } from '@/lib/analytics/track'
import { pidDuProfil } from '@/lib/profile/pid'
import { type ProfilPublic, profilPublicDe } from '@/services/public/profils'

/**
 * The click on a contact of a public profile (ticket 144; plan 02 U84, and E52 in a browser:
 * tests/e2e/mesure-clic-contact.spec.ts): counted once, with the profile and the channel, and not for
 * the artist herself, nor from her space, nor from a reminder link.
 */

const RACINE = path.resolve(import.meta.dir, '../..')
const ORIGINE = 'https://exemple.test'
const ANONYME = { recherche: '', referent: '', origine: ORIGINE }

/** A production browser with a stub `window.umami`: what the events handed to it are kept. */
function navigateur() {
	const recus: Array<{ nom: string; donnees: Record<string, string | number | boolean> }> = []
	const fenetre: FenetreMesuree = {
		navigator: { webdriver: false },
		umami: { track: (nom, donnees) => void recus.push({ nom, donnees }) },
	}
	const execution: Execution = { fenetre, production: true }
	return { recus, suivre: creerTrack(() => execution) }
}

describe('U84 : pas de contact_click pour la propriétaire, ni depuis son espace, ni par une relance', () => {
	test('une visiteuse quelconque est comptée', () => {
		expect(clicAMesurer({ pid: 12, pidDeLaVisiteuse: null, ...ANONYME })).toBe(true)
		expect(clicAMesurer({ pid: 12, pidDeLaVisiteuse: 99, ...ANONYME })).toBe(true)
		expect(clicAMesurer({ pid: 'v3-4', pidDeLaVisiteuse: 12, ...ANONYME })).toBe(true)
	})

	test('la propriétaire du profil ne l’est pas, pour un profil de l’ancien site comme pour un neuf', () => {
		expect(clicAMesurer({ pid: 12, pidDeLaVisiteuse: 12, ...ANONYME })).toBe(false)
		expect(clicAMesurer({ pid: 'v3-4', pidDeLaVisiteuse: 'v3-4', ...ANONYME })).toBe(false)
	})

	test('venir de son espace (/auth/...) : pas compté ; venir d’ailleurs : compté', () => {
		const depuis = (referent: string) => clicAMesurer({ pid: 1, pidDeLaVisiteuse: null, ...ANONYME, referent })
		expect(depuis(`${ORIGINE}/auth/profil`)).toBe(false)
		expect(depuis(`${ORIGINE}/auth/apercu-profil`)).toBe(false)
		expect(depuis(`${ORIGINE}/auth`)).toBe(false)
		expect(depuis(`${ORIGINE}/search?q=annecy`)).toBe(true)
		expect(depuis(`${ORIGINE}/authentique`)).toBe(true)
		// Another site with the same path is not her space.
		expect(depuis('https://autre.example.test/auth/profil')).toBe(true)
		expect(depuis('')).toBe(true)
		expect(depuis('pas une adresse')).toBe(true)
	})

	test('utm_campaign=relance : pas compté ; une autre campagne : compté', () => {
		const avec = (recherche: string) => clicAMesurer({ pid: 1, pidDeLaVisiteuse: null, ...ANONYME, recherche })
		expect(avec('?utm_campaign=relance')).toBe(false)
		expect(avec('?utm_source=email&utm_campaign=relance&utm_medium=mail')).toBe(false)
		expect(avec('?utm_campaign=Relance')).toBe(false)
		expect(avec('?utm_campaign=ete')).toBe(true)
		expect(avec('?utm_source=relance')).toBe(true)
	})

	test('un profil sans identifiant connu n’émet rien', () => {
		expect(clicAMesurer({ pid: null, pidDeLaVisiteuse: null, ...ANONYME })).toBe(false)
	})
})

describe('un clic de contact émet un événement, avec le bon canal', () => {
	test.each([
		'email',
		'phone',
		'instagram',
		'facebook',
		'linkedin',
		'youtube',
		'website',
	] as const)('%s : un événement, le profil et le canal', async canal => {
		const { recus, suivre } = navigateur()
		const emis = await mesurerUnClicDeContact({
			pid: 12,
			canal,
			lieu: ANONYME,
			monPid: Promise.resolve(null),
			suivre,
		})
		expect(emis).toBe(true)
		expect(recus).toEqual([{ nom: 'contact_click', donnees: { pid: 12, channel: canal } }])
	})

	test('la propriétaire, son espace, une relance : rien n’arrive à Umami', async () => {
		const { recus, suivre } = navigateur()
		const clic = { pid: 12 as Pid, canal: 'phone' as const, suivre }
		await mesurerUnClicDeContact({ ...clic, lieu: ANONYME, monPid: Promise.resolve(12) })
		await mesurerUnClicDeContact({
			...clic,
			lieu: { ...ANONYME, referent: `${ORIGINE}/auth/profil` },
			monPid: Promise.resolve(null),
		})
		await mesurerUnClicDeContact({
			...clic,
			lieu: { ...ANONYME, recherche: '?utm_campaign=relance' },
			monPid: Promise.resolve(null),
		})
		expect(recus).toEqual([])
	})

	test('la réponse du serveur sur la visiteuse est attendue ; si elle échoue, le clic est compté', async () => {
		const { recus, suivre } = navigateur()
		let repondre: (pid: Pid | null) => void = () => undefined
		const enRoute = new Promise<Pid | null>(resolve => {
			repondre = resolve
		})
		const clic = mesurerUnClicDeContact({ pid: 12, canal: 'email', lieu: ANONYME, monPid: enRoute, suivre })
		await Promise.resolve()
		expect(recus).toEqual([])
		repondre(12)
		expect(await clic).toBe(false)
		expect(recus).toEqual([])

		const panne = await mesurerUnClicDeContact({
			pid: 12,
			canal: 'email',
			lieu: ANONYME,
			monPid: Promise.reject(new Error('réseau')),
			suivre,
		})
		expect(panne).toBe(true)
		expect(recus).toHaveLength(1)
	})

	test('sans Umami, en développement ou dans un navigateur automatisé : rien, et aucune erreur', async () => {
		const clic = { pid: 12 as Pid, canal: 'phone' as const, lieu: ANONYME, monPid: Promise.resolve(null) }
		const sans = creerTrack(() => ({ fenetre: {}, production: true }))
		const dev = creerTrack(() => ({ fenetre: { umami: { track: () => 1 } }, production: false }))
		expect(await mesurerUnClicDeContact({ ...clic, suivre: sans })).toBe(false)
		expect(await mesurerUnClicDeContact({ ...clic, suivre: dev })).toBe(false)
	})
})

describe('pid du profil', () => {
	test('l’id de l’ancien site s’il existe, sinon v3-<id>, sinon rien', () => {
		expect(pidDuProfil({ id: 5, strapiId: 321 })).toBe(321)
		expect(pidDuProfil({ id: 5, strapiId: null })).toBe('v3-5')
		expect(pidDuProfil({ id: 5 })).toBe('v3-5')
		expect(pidDuProfil({ strapiId: 0 })).toBeNull()
		expect(pidDuProfil({})).toBeNull()
	})
})

describe('la page du profil', () => {
	const base = { slug: 'lea-exemple', prenom: 'Léa', nom: 'Exemple', statut: 'publie', publiable: true } as const
	const profil = (surcharge: Partial<Parameters<typeof profilPublicDe>[0]>, coordonnees: ProfilPublic['coordonnees']) =>
		profilPublicDe(
			{ ...base, id: 8, strapiId: 77, networks: { instagram: 'https://instagram.com/lea.exemple' }, ...surcharge },
			{ photo: null, galerie: [], coordonnees }
		)
	const rendre = (p: ProfilPublic, mesure?: boolean) =>
		renderToStaticMarkup(<VueDuProfil profil={p} {...(mesure === undefined ? {} : { mesure })} />)

	test('le profil porte son pid', () => {
		expect(profil({}, null).pid).toBe(77)
		expect(profil({ strapiId: null }, null).pid).toBe('v3-8')
	})

	test('un lien de contact par canal publié, avec son adresse, dans le HTML du serveur', () => {
		const html = rendre(profil({}, { telephone: '06 12 34 56 78', email: 'lea@example.test' }))
		expect(html).toContain('href="tel:0612345678"')
		expect(html).toContain('href="mailto:lea@example.test"')
		expect(html).toContain('href="https://instagram.com/lea.exemple"')
	})

	test('un profil sans contact public : ni lien de téléphone ni d’email, et aucune section de contacts', () => {
		const html = rendre(profil({ networks: {} }, null))
		expect(html).not.toContain('tel:')
		expect(html).not.toContain('mailto:')
		expect(html).not.toContain('Réseaux sociaux &amp; contacts')
	})

	test('l’aperçu de sa propre page garde les liens, et dit qu’il ne les compte pas', () => {
		const p = profil({}, { telephone: '06 12 34 56 78', email: null })
		expect(rendre(p, false)).toContain('href="tel:0612345678"')
		const apercu = readFileSync(path.join(RACINE, 'src/app/(front)/(dashboard)/auth/apercu-profil/page.tsx'), 'utf8')
		expect(apercu).toContain('<VueDuProfil profil={preview.profil} mesure={false} />')
	})
})

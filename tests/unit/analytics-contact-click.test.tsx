import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProfileView } from '@/components/profile/ProfileView'
import { clickToMeasure, measureContactClick } from '@/lib/analytics/contact-click'
import type { Pid } from '@/lib/analytics/events'
import { createTrack, type Execution, type MeasuredWindow } from '@/lib/analytics/track'
import { profilePid } from '@/lib/profile/pid'
import { type PublicProfile, publicProfileOf } from '@/services/public/profiles'

/**
 * The click on a contact of a public profile (ticket 144; plan 02 U84, and E52 in a browser:
 * tests/e2e/analytics-contact-click.spec.ts): counted once, with the profile and the channel, and not for
 * the artist herself, nor from her space, nor from a reminder link.
 */

const ROOT = path.resolve(import.meta.dir, '../..')
const ORIGIN = 'https://exemple.test'
const ANONYMOUS = { recherche: '', referent: '', origine: ORIGIN }

/** A production browser with a stub `window.umami`: what the events handed to it are kept. */
function browser() {
	const received: Array<{ nom: string; donnees: Record<string, string | number | boolean> }> = []
	const jsdomWindow: MeasuredWindow = {
		navigator: { webdriver: false },
		umami: { track: (nom, donnees) => void received.push({ nom, donnees }) },
	}
	const execution: Execution = { fenetre: jsdomWindow, production: true }
	return { recus: received, suivre: createTrack(() => execution) }
}

describe('U84 : pas de contact_click pour la propriétaire, ni depuis son espace, ni par une relance', () => {
	test('une visiteuse quelconque est comptée', () => {
		expect(clickToMeasure({ pid: 12, pidDeLaVisiteuse: null, ...ANONYMOUS })).toBe(true)
		expect(clickToMeasure({ pid: 12, pidDeLaVisiteuse: 99, ...ANONYMOUS })).toBe(true)
		expect(clickToMeasure({ pid: 'v3-4', pidDeLaVisiteuse: 12, ...ANONYMOUS })).toBe(true)
	})

	test('la propriétaire du profil ne l’est pas, pour un profil de l’ancien site comme pour un neuf', () => {
		expect(clickToMeasure({ pid: 12, pidDeLaVisiteuse: 12, ...ANONYMOUS })).toBe(false)
		expect(clickToMeasure({ pid: 'v3-4', pidDeLaVisiteuse: 'v3-4', ...ANONYMOUS })).toBe(false)
	})

	test('venir de son espace (/auth/...) : pas compté ; venir d’ailleurs : compté', () => {
		const since = (referent: string) => clickToMeasure({ pid: 1, pidDeLaVisiteuse: null, ...ANONYMOUS, referent })
		expect(since(`${ORIGIN}/auth/profil`)).toBe(false)
		expect(since(`${ORIGIN}/auth/apercu-profil`)).toBe(false)
		expect(since(`${ORIGIN}/auth`)).toBe(false)
		expect(since(`${ORIGIN}/search?q=annecy`)).toBe(true)
		expect(since(`${ORIGIN}/authentique`)).toBe(true)
		// Another site with the same path is not her space.
		expect(since('https://autre.example.test/auth/profil')).toBe(true)
		expect(since('')).toBe(true)
		expect(since('pas une adresse')).toBe(true)
	})

	test('utm_campaign=relance : pas compté ; une autre campagne : compté', () => {
		const withValue = (recherche: string) => clickToMeasure({ pid: 1, pidDeLaVisiteuse: null, ...ANONYMOUS, recherche })
		expect(withValue('?utm_campaign=relance')).toBe(false)
		expect(withValue('?utm_source=email&utm_campaign=relance&utm_medium=mail')).toBe(false)
		expect(withValue('?utm_campaign=Relance')).toBe(false)
		expect(withValue('?utm_campaign=ete')).toBe(true)
		expect(withValue('?utm_source=relance')).toBe(true)
	})

	test('un profil sans identifiant connu n’émet rien', () => {
		expect(clickToMeasure({ pid: null, pidDeLaVisiteuse: null, ...ANONYMOUS })).toBe(false)
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
		const { recus: received, suivre: follow } = browser()
		const emitted = await measureContactClick({
			pid: 12,
			canal,
			lieu: ANONYMOUS,
			monPid: Promise.resolve(null),
			suivre: follow,
		})
		expect(emitted).toBe(true)
		expect(received).toEqual([{ nom: 'contact_click', donnees: { pid: 12, channel: canal } }])
	})

	test('la propriétaire, son espace, une relance : rien n’arrive à Umami', async () => {
		const { recus: received, suivre: follow } = browser()
		const click = { pid: 12 as Pid, canal: 'phone' as const, suivre: follow }
		await measureContactClick({ ...click, lieu: ANONYMOUS, monPid: Promise.resolve(12) })
		await measureContactClick({
			...click,
			lieu: { ...ANONYMOUS, referent: `${ORIGIN}/auth/profil` },
			monPid: Promise.resolve(null),
		})
		await measureContactClick({
			...click,
			lieu: { ...ANONYMOUS, recherche: '?utm_campaign=relance' },
			monPid: Promise.resolve(null),
		})
		expect(received).toEqual([])
	})

	test('la réponse du serveur sur la visiteuse est attendue ; si elle échoue, le clic est compté', async () => {
		const { recus: received, suivre: follow } = browser()
		let respond: (pid: Pid | null) => void = () => undefined
		const inRoute = new Promise<Pid | null>(resolve => {
			respond = resolve
		})
		const click = measureContactClick({ pid: 12, canal: 'email', lieu: ANONYMOUS, monPid: inRoute, suivre: follow })
		await Promise.resolve()
		expect(received).toEqual([])
		respond(12)
		expect(await click).toBe(false)
		expect(received).toEqual([])

		const failure = await measureContactClick({
			pid: 12,
			canal: 'email',
			lieu: ANONYMOUS,
			monPid: Promise.reject(new Error('réseau')),
			suivre: follow,
		})
		expect(failure).toBe(true)
		expect(received).toHaveLength(1)
	})

	test('sans Umami, en développement ou dans un navigateur automatisé : rien, et aucune erreur', async () => {
		const click = { pid: 12 as Pid, canal: 'phone' as const, lieu: ANONYMOUS, monPid: Promise.resolve(null) }
		const without = createTrack(() => ({ fenetre: {}, production: true }))
		const dev = createTrack(() => ({ fenetre: { umami: { track: () => 1 } }, production: false }))
		expect(await measureContactClick({ ...click, suivre: without })).toBe(false)
		expect(await measureContactClick({ ...click, suivre: dev })).toBe(false)
	})
})

describe('pid du profil', () => {
	test('l’id de l’ancien site s’il existe, sinon v3-<id>, sinon rien', () => {
		expect(profilePid({ id: 5, strapiId: 321 })).toBe(321)
		expect(profilePid({ id: 5, strapiId: null })).toBe('v3-5')
		expect(profilePid({ id: 5 })).toBe('v3-5')
		expect(profilePid({ strapiId: 0 })).toBeNull()
		expect(profilePid({})).toBeNull()
	})
})

describe('la page du profil', () => {
	const base = { slug: 'lea-exemple', prenom: 'Léa', nom: 'Exemple', statut: 'publie', publiable: true } as const
	const profile = (
		surcharge: Partial<Parameters<typeof publicProfileOf>[0]>,
		coordonnees: PublicProfile['coordonnees']
	) =>
		publicProfileOf(
			{ ...base, id: 8, strapiId: 77, networks: { instagram: 'https://instagram.com/lea.exemple' }, ...surcharge },
			{ photo: null, galerie: [], coordonnees }
		)
	const renderNow = (p: PublicProfile, mesure?: boolean) =>
		renderToStaticMarkup(<ProfileView profil={p} {...(mesure === undefined ? {} : { mesure })} />)

	test('le profil porte son pid', () => {
		expect(profile({}, null).pid).toBe(77)
		expect(profile({ strapiId: null }, null).pid).toBe('v3-8')
	})

	test('un lien de contact par canal publié, avec son adresse, dans le HTML du serveur', () => {
		const html = renderNow(profile({}, { telephone: '06 12 34 56 78', email: 'lea@example.test' }))
		expect(html).toContain('href="tel:0612345678"')
		expect(html).toContain('href="mailto:lea@example.test"')
		expect(html).toContain('href="https://instagram.com/lea.exemple"')
	})

	test('un profil sans contact public : ni lien de téléphone ni d’email, et aucune section de contacts', () => {
		const html = renderNow(profile({ networks: {} }, null))
		expect(html).not.toContain('tel:')
		expect(html).not.toContain('mailto:')
		expect(html).not.toContain('Réseaux sociaux &amp; contacts')
	})

	test('l’aperçu de sa propre page garde les liens, et dit qu’il ne les compte pas', () => {
		const p = profile({}, { telephone: '06 12 34 56 78', email: null })
		expect(renderNow(p, false)).toContain('href="tel:0612345678"')
		const preview = readFileSync(path.join(ROOT, 'src/app/(front)/(dashboard)/auth/profil/page.tsx'), 'utf8')
		expect(preview).toContain('<ProfileView profil={preview.profil} mesure={false} />')
	})
})

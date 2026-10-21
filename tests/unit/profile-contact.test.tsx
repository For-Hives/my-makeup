import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ContactButton } from '@/components/profile/ContactButton'
import { ProfileView } from '@/components/profile/ProfileView'
import { DEMO_PROFILES, type DemoProfile } from '@/demo-data/profiles'
import { contactActions } from '@/lib/profile/contact-actions'
import { type ProfilePageData, type PublicProfile, publicProfileOf } from '@/services/public/profiles'
import { openWindow } from '../support/dom-react'

/**
 * The « Contacter » button of the page of a profile (ticket 290; audit UX, improvement 1): a bar stuck
 * at the bottom of the phone and a button under the header on a computer, which open a sheet of wide
 * buttons (call, write, Instagram, website), each one counted as before.
 */

const type = (cle: string): DemoProfile => {
	const found = DEMO_PROFILES.find(profil => profil.cle === cle)
	if (!found) throw new Error(`pas de profil type « ${cle} »`)
	return found
}

/** A profile of the set as the public reading holds it: the contact details leave only when published. */
function readType(demo: DemoProfile, surcharge: Partial<ProfilePageData> = {}): PublicProfile {
	const doc: ProfilePageData = {
		slug: demo.attendu.slug,
		status: demo.attendu.status,
		publishable: demo.attendu.publishable,
		...demo.profil,
		...surcharge,
	}
	const { phone = null, email = null } = demo.profil.contactDetails ?? {}
	const contactDetails = demo.profil.publicContact === true && (phone || email) ? { telephone: phone, email } : null
	return publicProfileOf(doc, { photo: null, galerie: [], coordonnees: contactDetails })
}

const render = (profil: PublicProfile): string => renderToStaticMarkup(<ProfileView profil={profil} />)

describe('le bouton « Contacter » dans le HTML de la fiche', () => {
	test('un profil avec téléphone, email et Instagram : le bouton, dans la barre du bas et sous l’en-tête', () => {
		const html = render(readType(type('reference')))

		expect(html.match(/>Contacter Inès</g)).toHaveLength(2)
		expect(html).toContain('aria-haspopup="dialog"')
		// The bar is for the phone, the button of the header for the computer.
		expect(html).toMatch(/class="[^"]*md:hidden[^"]*"[^>]*>(?:(?!<\/div>)[\s\S])*Contacter Inès/)
		expect(html).toContain('À partir de 45 €')
	})

	test('le bouton est la dernière chose de la fiche, collé en bas sans recouvrir le pied de page', () => {
		const html = render(readType(type('reference')))

		expect(html).toContain('sticky bottom-0')
		const bar = html.indexOf('sticky bottom-0')
		expect(html.indexOf('</main>')).toBeGreaterThan(bar)
		expect(html.slice(bar, html.indexOf('</main>'))).not.toContain('<section')
	})

	test('un profil sans coordonnées publiques : aucun bouton', () => {
		for (const key of ['sans-contact-public', 'vide']) {
			const html = render(readType(type(key)))
			expect(html, key).not.toContain('Contacter')
			expect(html, key).not.toContain('aria-haspopup')
		}
	})

	test('aucune coordonnée privée : le téléphone et l’email non publiés n’apparaissent nulle part', () => {
		const html = render(readType(type('sans-contact-public')))

		expect(html).not.toContain('06 39 98 10 08')
		expect(html).not.toContain('louise-girard.example.test')
		expect(html).not.toContain('tel:')
	})

	test('sans prénom, le bouton parle de « la maquilleuse »', () => {
		const html = render(readType(type('reference'), { firstName: null, lastName: null, artistName: null }))

		expect(html).toContain('Contacter la maquilleuse')
	})
})

describe('contactActions : les actions de la feuille', () => {
	const actions = (key: string) => contactActions(readType(type(key)).liens, 'Inès')

	test('appeler, écrire, puis les réseaux et le site, chacun avec un nom qui dit l’action', () => {
		expect(actions('reference').map(({ title, detail }) => [title, detail])).toEqual([
			['Appeler Inès', '06 39 98 10 01'],
			['Écrire à Inès', 'contact@ines-morel.example.test'],
			['Instagram d’Inès', '@ines.morel'],
			['Site d’Inès', 'ines-morel.example.test'],
		])
	})

	test('un lien qui ne mène nulle part n’est pas une action', () => {
		const links = readType(type('reference'), { networks: { instagram: 'deux mots' } }).liens
		expect(contactActions(links, 'Inès').map(({ canal }) => canal)).toEqual(['phone', 'email'])
		expect(contactActions([], 'Inès')).toEqual([])
	})

	test('l’élision suit le prénom : « de Léa », « d’Hélène »', () => {
		const links = readType(type('reference')).liens
		expect(contactActions(links, 'Léa')[2]?.title).toBe('Instagram de Léa')
		expect(contactActions(links, 'Hélène')[3]?.title).toBe('Site d’Hélène')
	})
})

describe('la feuille de contact, dans le navigateur', () => {
	const jsdomWindow = openWindow({ noms: ['location'] })
	const sent: Array<{ nom: string; donnees: unknown }> = []
	const realFetch = globalThis.fetch
	const previousEnv = process.env.NODE_ENV

	beforeEach(() => {
		sent.length = 0
		// A production browser with a stub Umami; the visitor is nobody in particular.
		;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
		globalThis.fetch = (() => Promise.resolve(new Response(JSON.stringify({ pid: null })))) as unknown as typeof fetch
		const w = jsdomWindow.w as unknown as { umami?: unknown }
		w.umami = { track: (nom: string, donnees: unknown) => void sent.push({ nom, donnees }) }
		if (typeof jsdomWindow.w.HTMLDialogElement.prototype.showModal !== 'function')
			jsdomWindow.w.HTMLDialogElement.prototype.showModal = function showModal() {
				this.setAttribute('open', '')
			}
		// A click on a link would navigate: the test only watches it.
		jsdomWindow.w.document.addEventListener('click', event => event.preventDefault())
	})
	afterEach(() => {
		;(process.env as Record<string, string | undefined>).NODE_ENV = previousEnv
		globalThis.fetch = realFetch
	})

	const button = (mesure = true) => (
		<ContactButton
			placement="header"
			name="Inès"
			price={null}
			actions={contactActions(readType(type('reference')).liens, 'Inès')}
			pid={12}
			mesure={mesure}
		/>
	)

	test('un appui ouvre la feuille : quatre actions larges, nommées par ce qu’elles font', async () => {
		const zone = await jsdomWindow.monter(button())
		expect(zone.querySelector('dialog')).toBeNull()

		await jsdomWindow.cliquer(jsdomWindow.bouton('Contacter Inès'))

		const dialog = zone.querySelector('dialog')
		expect(dialog?.hasAttribute('open')).toBe(true)
		expect(dialog?.getAttribute('aria-modal') ?? 'true').toBe('true')
		const links = [...(dialog?.querySelectorAll('a') ?? [])]
		expect(links.map(link => [...link.querySelectorAll('span')].map(span => span.textContent).join(' '))).toEqual([
			'Appeler Inès 06 39 98 10 01',
			'Écrire à Inès contact@ines-morel.example.test',
			'Instagram d’Inès @ines.morel',
			'Site d’Inès ines-morel.example.test',
		])
		expect(links.map(link => link.getAttribute('href'))).toEqual([
			'tel:0639981001',
			'mailto:contact@ines-morel.example.test',
			'https://instagram.example.test/ines.morel',
			'https://ines-morel.example.test/',
		])
		// A wide target: at least 48 px (min-h-12).
		for (const link of links) expect(link.className).toContain('min-h-12')
	})

	test('Échap ferme la feuille et rend le focus au bouton', async () => {
		const zone = await jsdomWindow.monter(button())
		const opener = jsdomWindow.bouton('Contacter Inès')
		await jsdomWindow.cliquer(opener)
		const dialog = zone.querySelector('dialog') as HTMLDialogElement

		await jsdomWindow.attendre(() => zone.querySelector('dialog'))
		await act(async () => {
			dialog.dispatchEvent(
				new jsdomWindow.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
			)
		})

		await jsdomWindow.attendre(() => zone.querySelector('dialog') === null)
		expect(jsdomWindow.w.document.activeElement).toBe(opener)
	})

	test('le bouton « Fermer » ferme aussi, et rend le focus', async () => {
		const zone = await jsdomWindow.monter(button())
		const opener = jsdomWindow.bouton('Contacter Inès')
		await jsdomWindow.cliquer(opener)

		await jsdomWindow.cliquer(jsdomWindow.bouton('Fermer'))

		expect(zone.querySelector('dialog')).toBeNull()
		expect(jsdomWindow.w.document.activeElement).toBe(opener)
	})

	test('chaque action garde sa mesure : l’événement part avec le bon canal', async () => {
		const zone = await jsdomWindow.monter(button())
		await jsdomWindow.cliquer(jsdomWindow.bouton('Contacter Inès'))
		const link = (name: RegExp) =>
			[...zone.querySelectorAll('a')].find(candidate => name.test(candidate.textContent ?? '')) as HTMLAnchorElement

		await jsdomWindow.cliquer(link(/^Appeler/))
		await jsdomWindow.cliquer(link(/^Écrire/))
		await jsdomWindow.cliquer(link(/^Instagram/))
		await jsdomWindow.cliquer(link(/^Site/))

		await jsdomWindow.attendre(() => sent.length === 4)
		expect(sent.map(event => event.nom)).toEqual(Array(4).fill('contact_click'))
		expect(sent.map(event => event.donnees)).toEqual([
			{ pid: 12, channel: 'phone' },
			{ pid: 12, channel: 'email' },
			{ pid: 12, channel: 'instagram' },
			{ pid: 12, channel: 'website' },
		])
	})

	test('l’aperçu de sa propre page ne compte aucun clic', async () => {
		const zone = await jsdomWindow.monter(button(false))
		await jsdomWindow.cliquer(jsdomWindow.bouton('Contacter Inès'))

		await jsdomWindow.cliquer(zone.querySelector('a') as HTMLAnchorElement)

		await new Promise(resolve => setTimeout(resolve, 50))
		expect(sent).toEqual([])
	})
})

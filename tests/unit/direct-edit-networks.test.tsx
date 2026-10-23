import { describe, expect, test } from 'bun:test'
import { FAILURE_MESSAGE, MESSAGE_SESSION } from '@/lib/dashboard/result'
import { benchOf, EMPTY, FULL } from '../support/direct-edit-bench'
import { openWindow } from '../support/dom-react'

/**
 * Réseaux et liens on her own page in edit mode (issue 1021): « @pseudo » and the domain are shown instead
 * of raw addresses, an invalid address is refused with a clear message, the outgoing links carry the
 * usual safety attributes, and the order of the links is the fixed one of the page (Instagram first).
 */

const window_ = openWindow()
const doc = () => window_.w.document
const alerts = () => [...doc().querySelectorAll('[role="alert"]')].map(alert => alert.textContent).join('|')
const open = async (actions = {}, profile = FULL) => {
	const bench = benchOf(window_, { profile, actions })
	await bench.mount()
	await window_.cliquer(window_.bouton('Modifier mes réseaux'))
	return bench
}

describe('le bloc', () => {
	test('est un bouton nommé pour ce qu’il change ; la carte des réseaux et celle des contacts sont deux blocs', async () => {
		await benchOf(window_).mount()
		expect(window_.bouton('Modifier mes réseaux').getAttribute('aria-expanded')).toBe('false')
		expect(window_.bouton('Modifier mes coordonnées')).toBeDefined()
		const titles = [...doc().querySelectorAll('h2')].map(title => title.textContent)
		expect(titles).toContain('Réseaux sociaux')
		expect(titles).toContain('Contacts')
	})

	test('affiche « @pseudo » au lieu de l’adresse, et le lien sort avec les attributs de sécurité', async () => {
		await benchOf(window_).mount()
		const link = [...doc().querySelectorAll('a')].find(anchor => anchor.getAttribute('href')?.includes('instagram.com'))
		expect(link?.textContent).toBe('@ines.fictive')
		expect(link?.getAttribute('target')).toBe('_blank')
		expect(link?.getAttribute('rel')).toBe('noopener nofollow noreferrer')
	})

	test('vide, il reste sur la page et dit quoi faire', async () => {
		await benchOf(window_, { profile: EMPTY }).mount()
		expect(doc().body.textContent).toContain('Ajoute ton Instagram ou ton site.')
	})
})

describe('l’édition', () => {
	test('les champs suivent l’ordre de la page, Instagram en premier, et l’ordre est dit', async () => {
		await open()
		const labels = [...doc().querySelectorAll('[data-direct-edit-editor] label')].map(label => label.textContent)
		expect(labels).toEqual(['Instagram', 'Facebook', 'LinkedIn', 'YouTube', 'Site web'])
		expect(doc().body.textContent).toContain('les liens s’affichent dans cet ordre')
	})

	test('« @pseudo » est lu comme la page le lira, et part sous la forme d’une adresse', async () => {
		const bench = await open()
		await window_.saisir(window_.champ('YouTube'), '@ma.chaine')
		expect(doc().body.textContent).toContain('Sur ta page : @ma.chaine')
		await window_.saisir(window_.champ('Site web'), 'https://www.ton-site.fr/portfolio')
		expect(doc().body.textContent).toContain('Sur ta page : ton-site.fr')
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => bench.calls.saveNetworks?.length || null)
		expect(bench.calls.saveNetworks).toEqual([
			{
				instagram: 'https://www.instagram.com/ines.fictive',
				facebook: '',
				linkedin: '',
				youtube: 'https://www.youtube.com/@ma.chaine',
				siteWeb: 'https://www.ton-site.fr/portfolio',
			},
		])
	})

	test('une adresse invalide est refusée avec un message clair, rien n’est envoyé', async () => {
		const bench = await open()
		await window_.saisir(window_.champ('Facebook'), 'https://www.instagram.com/ines.fictive')
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(
			() => (doc().body.textContent ?? '').includes('Cette adresse n’est pas celle de Facebook') || null
		)
		expect(window_.champ('Facebook').getAttribute('aria-invalid')).toBe('true')
		expect(bench.calls.saveNetworks).toBeUndefined()
	})

	test('un site qui n’est pas une adresse est refusé', async () => {
		const bench = await open()
		await window_.saisir(window_.champ('Site web'), '@pseudo')
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => (doc().body.textContent ?? '').includes('Ce n’est pas une adresse de site') || null)
		expect(bench.calls.saveNetworks).toBeUndefined()
	})

	test('vider un champ retire le lien', async () => {
		const bench = await open()
		await window_.saisir(window_.champ('Instagram'), '')
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => bench.calls.saveNetworks?.length || null)
		expect((bench.calls.saveNetworks?.[0] as { instagram: string }).instagram).toBe('')
	})

	test('un échec garde la saisie, la session expirée aussi', async () => {
		await open({ saveNetworks: async () => ({ ok: false, message: FAILURE_MESSAGE }) })
		await window_.saisir(window_.champ('Facebook'), 'https://www.facebook.com/ines.fictive')
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => alerts().includes(FAILURE_MESSAGE) || null)
		expect((window_.champ('Facebook') as HTMLInputElement).value).toBe('https://www.facebook.com/ines.fictive')
		await window_.demonter()
		await open({ saveNetworks: async () => ({ ok: false, message: MESSAGE_SESSION, session: 'expiree' }) })
		await window_.saisir(window_.champ('Facebook'), 'https://www.facebook.com/ines.fictive')
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => alerts().includes(MESSAGE_SESSION) || null)
		expect((window_.champ('Facebook') as HTMLInputElement).value).toBe('https://www.facebook.com/ines.fictive')
	})

	test('le message d’un champ refusé par le serveur est dit sous ce champ', async () => {
		await open({
			saveNetworks: async () => ({
				ok: false,
				message: 'Un lien n’est pas valide.',
				champs: { facebook: 'Ce lien ne va pas.' },
			}),
		})
		await window_.saisir(window_.champ('Facebook'), 'https://www.facebook.com/ines.fictive')
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => (doc().body.textContent ?? '').includes('Ce lien ne va pas.') || null)
	})
})

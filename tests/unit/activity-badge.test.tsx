/**
 * The badge « Activité vérifiée » on a profile and on a card (issue 1004). It appears only when the registry
 * said the establishment is active; without it, the HTML is exactly what it was (the golden files of
 * tests/fixtures/direct-edit). It says what is checked, links to its explanation, holds no SIRET, and never
 * nests a link in the link of a card. Made-up values only.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { ActivityBadge } from '@/components/profile/ActivityBadge'
import { ProfileView } from '@/components/profile/ProfileView'
import { ResultCard } from '@/components/search/ResultCard'
import { DEMO_PROFILES } from '@/demo-data/profiles'
import { BADGE_HELP_LINK, BADGE_HELP_PATH, BADGE_LABEL } from '@/lib/activity/badge-text'
import { profileMetadata, profileStructuredData } from '@/lib/seo/profile'
import { type ProfileCard, type ProfilePageData, publicProfileOf } from '@/services/public/profiles'

const GOLDEN = join(import.meta.dir, '../fixtures/direct-edit/reference.golden')

function reference(activity?: { checkedAt: string | null }) {
	const type = DEMO_PROFILES.find(profile => profile.cle === 'reference')
	if (!type) throw new Error('pas de profil type « reference »')
	const doc: ProfilePageData = {
		slug: type.attendu.slug,
		status: type.attendu.status,
		publishable: type.attendu.publishable,
		...type.profil,
	}
	const photo = type.photos.principale
		? { url: `https://photos.example.test/media/${type.photos.principale}`, width: 400, height: 400 }
		: null
	const gallery = type.photos.galerie.map(fichier => ({
		url: `https://photos.example.test/media/${fichier}`,
		width: 400,
		height: 400,
	}))
	const { phone = null, email = null } = type.profil.contactDetails ?? {}
	const contact = type.profil.publicContact === true && (phone || email) ? { telephone: phone, email } : null
	return publicProfileOf(doc, { photo, galerie: gallery, coordonnees: contact, ...(activity && { activity }) })
}

const CHECKED = '2026-10-20T09:00:00.000Z'

describe('1004 : le badge sur la fiche', () => {
	test('sans badge, la clé est absente et le HTML est celui du fichier de référence', () => {
		const profile = reference()
		expect('activityVerified' in profile).toBe(false)
		expect(renderToStaticMarkup(<ProfileView profil={profile} />)).toBe(readFileSync(GOLDEN, 'utf8'))
	})

	test('avec le badge, la page est celle du fichier de référence plus le seul bloc du badge', () => {
		const html = renderToStaticMarkup(<ProfileView profil={reference({ checkedAt: CHECKED })} />)
		const block = renderToStaticMarkup(<ActivityBadge checkedAt={CHECKED} />)
		expect(html.replace(block, '')).toBe(readFileSync(GOLDEN, 'utf8'))
	})

	test('le badge dit ce qui est contrôlé, quand, et renvoie vers l’explication', () => {
		const html = renderToStaticMarkup(<ActivityBadge checkedAt={CHECKED} />)
		const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
		expect(text).toContain(BADGE_LABEL)
		expect(text).toContain(
			'Établissement en activité d’après l’annuaire public des entreprises, contrôlé le 20 octobre 2026'
		)
		expect(html).toContain(`href="${BADGE_HELP_PATH}"`)
		expect(text).toContain(BADGE_HELP_LINK)
		// A text before a mark: the check is decoration, and neither the lipstick nor an alert colour is used.
		expect(html).toContain('aria-hidden="true"')
		expect(html).not.toMatch(/lipstick|red-|amber-|yellow-|rose-/)
	})

	test('une date inconnue n’invente pas de date', () => {
		const text = renderToStaticMarkup(<ActivityBadge checkedAt={null} />)
		expect(text).toContain('Établissement en activité d’après l’annuaire public des entreprises.')
		expect(text).not.toContain('contrôlé le')
	})

	test('les données structurées ne changent pas', () => {
		const json = (activity?: { checkedAt: string | null }) =>
			JSON.stringify([profileStructuredData(reference(activity)), profileMetadata(reference(activity))])
		expect(json({ checkedAt: CHECKED })).toBe(json())
	})
})

describe('1004 : le badge sur une carte', () => {
	const card: ProfileCard = {
		slug: 'exemple',
		pid: 1 as never,
		nom: 'Exemple Fictive',
		specialite: 'Mariage',
		lieu: 'Annecy',
		superMaquilleuse: false,
		photo: null,
	}

	test('sans badge, la carte est celle d’avant', () => {
		const html = renderToStaticMarkup(<ResultCard carte={card} prioritaire={false} />)
		expect(html).not.toContain(BADGE_LABEL)
	})

	test('avec le badge : un texte lisible, dans la carte, et pas un lien dans le lien', () => {
		const html = renderToStaticMarkup(<ResultCard carte={{ ...card, activityVerified: true }} prioritaire={false} />)
		expect(html).toContain(BADGE_LABEL)
		expect(html.match(/<a[ >]/g)).toHaveLength(1)
		expect(html).not.toContain(BADGE_HELP_PATH)
	})

	test('la carte avec le badge ne porte ni SIRET ni date', () => {
		const html = renderToStaticMarkup(<ResultCard carte={{ ...card, activityVerified: true }} prioritaire={false} />)
		expect(html).not.toMatch(/siret|\d{14}|contrôlé/i)
	})
})

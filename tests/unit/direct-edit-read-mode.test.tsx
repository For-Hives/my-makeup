import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProfileView } from '@/components/profile/ProfileView'
import { DEMO_PROFILES, type DemoProfile } from '@/demo-data/profiles'
import { type ProfilePageData, type PublicProfile, publicProfileOf } from '@/services/public/profiles'

/**
 * The page of a visitor does not change (issue 1008): the profile is drawn by the same component for her
 * and for the owner, and without the editing slot its HTML is the one it was before the direct edition
 * existed. The golden files were written from the code of that time; a change of the public page on
 * purpose rewrites them with `UPDATE_GOLDEN=1`. The code of the edition is never loaded by the public
 * page either: no module of the public path imports it.
 */

const PHOTO_URL = 'https://photos.example.test/media'
const GOLDEN = join(import.meta.dir, '../fixtures/direct-edit')

function readType(type: DemoProfile): PublicProfile {
	const doc: ProfilePageData = {
		slug: type.attendu.slug,
		status: type.attendu.status,
		publishable: type.attendu.publishable,
		...type.profil,
	}
	const photo = type.photos.principale
		? { url: `${PHOTO_URL}/${type.photos.principale}`, width: 400, height: 400 }
		: null
	const gallery = type.photos.galerie.map(fichier => ({ url: `${PHOTO_URL}/${fichier}`, width: 400, height: 400 }))
	const { phone = null, email = null } = type.profil.contactDetails ?? {}
	const contactDetails = type.profil.publicContact === true && (phone || email) ? { telephone: phone, email } : null
	return publicProfileOf(doc, { photo, galerie: gallery, coordonnees: contactDetails })
}

const CASES = { reference: 'reference', vide: 'empty', indisponible: 'unavailable' } as const

describe('la page d’une visiteuse : le HTML ne change pas', () => {
	for (const [key, name] of Object.entries(CASES)) {
		test(`le profil « ${key} » est rendu comme avant, sans aucun contrôle d’édition`, () => {
			const type = DEMO_PROFILES.find(profile => profile.cle === key)
			if (!type) throw new Error(`pas de profil type « ${key} »`)
			const html = renderToStaticMarkup(<ProfileView profil={readType(type)} />)
			const file = join(GOLDEN, `${name}.golden`)
			if (process.env.UPDATE_GOLDEN === '1') writeFileSync(file, html)
			expect(html).toBe(readFileSync(file, 'utf8'))
			expect(html).not.toContain('data-direct-edit')
			expect(html).not.toMatch(/Modifier ma|Modifier mon/)
		})
	}
})

/** Every source file under a folder, whole paths. */
function sources(folder: string): string[] {
	return readdirSync(folder).flatMap(name => {
		const path = join(folder, name)
		return statSync(path).isDirectory() ? sources(path) : /\.tsx?$/.test(name) ? [path] : []
	})
}

describe('le code de l’édition n’est chargé que pour la propriétaire', () => {
	const root = join(import.meta.dir, '../../src')

	test('rien du chemin public n’importe le dossier de l’édition directe', () => {
		const publicPath = [
			...sources(join(root, 'components/profile')),
			join(root, 'app/(front)/(site)/profil/[slug]/page.tsx'),
			join(root, 'services/public/profiles.ts'),
		]
		expect(publicPath.length).toBeGreaterThan(5)
		for (const file of publicPath) {
			if (!existsSync(file)) continue
			expect(readFileSync(file, 'utf8'), file).not.toMatch(/direct-edit/)
		}
	})
})

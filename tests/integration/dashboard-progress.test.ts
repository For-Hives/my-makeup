import { afterEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { artistProfile, type DashboardUser } from '@/lib/dashboard/my-profile'
import { profileProgress } from '@/lib/dashboard/progress'
import { saveDescription } from '@/lib/dashboard/save-description'
import { saveIdentity } from '@/lib/dashboard/save-identity'
import { saveNetworks } from '@/lib/dashboard/save-networks'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'

/**
 * The progress block of her space (ticket 138; plan 02 I20): after each save, what the page shows
 * (`profileProgress`, read as herself) equals what the server stored in `completude`, `actif`,
 * `publiable` and `entierementVide`. The page renders again after a save (`revalidatePath` in each
 * action), so this equality is what she sees move without a reload.
 */

afterEach(emptyBase)

async function userOf(payload: Payload, id: number | string): Promise<DashboardUser> {
	const doc = await payload.findByID({ collection: 'pros', id, depth: 0, overrideAccess: true })
	return { ...doc, collection: 'pros' } as DashboardUser
}

/** The page's reading and the stored state of her profile. */
async function reads(payload: Payload, utilisateur: DashboardUser) {
	const profile = await artistProfile(payload, utilisateur)
	if (profile === null) throw new Error('pas de profil')
	const { docs } = await payload.find({
		collection: 'profiles',
		depth: 0,
		overrideAccess: true,
		where: { id: { equals: profile.id } },
	})
	const stored = docs[0]
	if (!stored) throw new Error('profil non stocké')
	return { avancement: profileProgress(profile), stocke: stored }
}

describe('I20 : le bloc de l’espace égale l’état enregistré par le serveur, à chaque étape', () => {
	test('profil vide, puis après chaque enregistrement', async () => {
		const account = await createAccount('maquilleuse')
		const payload = await testPayload()
		const user = await userOf(payload, account.id)

		const equal = async () => {
			const { avancement: progress, stocke: stored } = await reads(payload, user)
			expect(progress.score).toBe(stored.completeness ?? Number.NaN)
			expect(progress.etat === 'publiable').toBe(stored.publishable === true)
			expect(progress.etat === 'vide').toBe(stored.fullyEmpty === true)
			return progress
		}

		const empty = await equal()
		expect(empty.score).toBe(0)
		expect(empty.manques).toHaveLength(13)

		await saveIdentity(payload, user, {
			prenom: 'Léa',
			nom: 'Fictive',
			nomArtiste: '',
			specialite: 'Mariage',
		})
		const afterIdentity = await equal()
		expect(afterIdentity.score).toBe(2)
		expect(afterIdentity.etat).toBe('incomplet')
		expect(afterIdentity.manques.some(m => m.critere === 'specialite')).toBe(false)

		await saveDescription(payload, user, { description: 'a'.repeat(199) })
		const short = await equal()
		expect(short.manques.find(m => m.critere === 'description')?.requis).toBe(true)

		await saveDescription(payload, user, { description: 'a'.repeat(200) })
		const long = await equal()
		expect(long.manques.some(m => m.critere === 'description')).toBe(false)

		await saveNetworks(payload, user, {
			instagram: '@studio.fictif',
			facebook: '',
			youtube: '',
			linkedin: '',
			siteWeb: '',
		})
		const networks = await equal()
		expect(networks.manques.some(m => m.critere === 'reseaux')).toBe(false)
	})
})

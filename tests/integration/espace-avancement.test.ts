import { afterEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { avancementDuProfil } from '@/lib/espace/avancement'
import { enregistrerDescription } from '@/lib/espace/enregistrer-description'
import { enregistrerIdentite } from '@/lib/espace/enregistrer-identite'
import { enregistrerReseaux } from '@/lib/espace/enregistrer-reseaux'
import { profilDeLaMaquilleuse, type UtilisateurDeLEspace } from '@/lib/espace/mon-profil'
import { creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'

/**
 * The progress block of her space (ticket 138; plan 02 I20): after each save, what the page shows
 * (`avancementDuProfil`, read as herself) equals what the server stored in `completude`, `actif`,
 * `publiable` and `entierementVide`. The page renders again after a save (`revalidatePath` in each
 * action), so this equality is what she sees move without a reload.
 */

afterEach(viderLaBase)

async function utilisateurDe(payload: Payload, id: number | string): Promise<UtilisateurDeLEspace> {
	const doc = await payload.findByID({ collection: 'pros', id, depth: 0, overrideAccess: true })
	return { ...doc, collection: 'pros' } as UtilisateurDeLEspace
}

/** The page's reading and the stored state of her profile. */
async function lectures(payload: Payload, utilisateur: UtilisateurDeLEspace) {
	const profil = await profilDeLaMaquilleuse(payload, utilisateur)
	if (profil === null) throw new Error('pas de profil')
	const { docs } = await payload.find({
		collection: 'profiles',
		depth: 0,
		overrideAccess: true,
		where: { id: { equals: profil.id } },
	})
	const stocke = docs[0]
	if (!stocke) throw new Error('profil non stocké')
	return { avancement: avancementDuProfil(profil), stocke }
}

describe('I20 : le bloc de l’espace égale l’état enregistré par le serveur, à chaque étape', () => {
	test('profil vide, puis après chaque enregistrement', async () => {
		const compte = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		const utilisateur = await utilisateurDe(payload, compte.id)

		const egaux = async () => {
			const { avancement, stocke } = await lectures(payload, utilisateur)
			expect(avancement.score).toBe(stocke.completeness ?? Number.NaN)
			expect(avancement.etat === 'publiable').toBe(stocke.publishable === true)
			expect(avancement.etat === 'vide').toBe(stocke.fullyEmpty === true)
			return avancement
		}

		const vide = await egaux()
		expect(vide.score).toBe(0)
		expect(vide.manques).toHaveLength(13)

		await enregistrerIdentite(payload, utilisateur, {
			prenom: 'Léa',
			nom: 'Fictive',
			nomArtiste: '',
			specialite: 'Mariage',
		})
		const apresIdentite = await egaux()
		expect(apresIdentite.score).toBe(2)
		expect(apresIdentite.etat).toBe('incomplet')
		expect(apresIdentite.manques.some(m => m.critere === 'specialite')).toBe(false)

		await enregistrerDescription(payload, utilisateur, { description: 'a'.repeat(199) })
		const court = await egaux()
		expect(court.manques.find(m => m.critere === 'description')?.requis).toBe(true)

		await enregistrerDescription(payload, utilisateur, { description: 'a'.repeat(200) })
		const long = await egaux()
		expect(long.manques.some(m => m.critere === 'description')).toBe(false)

		await enregistrerReseaux(payload, utilisateur, {
			instagram: '@studio.fictif',
			facebook: '',
			youtube: '',
			linkedin: '',
			siteWeb: '',
		})
		const reseaux = await egaux()
		expect(reseaux.manques.some(m => m.critere === 'reseaux')).toBe(false)
	})
})

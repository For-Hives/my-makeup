import { toast } from 'react-toastify'
import { track } from '@/lib/analytics'
import { preparerPhotoNavigateur } from '@/lib/photo-navigateur'

/**
 * A picture picked in a modal (UI-03): checked and compressed in the
 * browser, nothing is sent yet. A refused picture is counted
 * (`upload_error`) and explained in a toast; the modal also shows the
 * message next to the field.
 * @param {File} fichier
 * @returns {ReturnType<typeof preparerPhotoNavigateur>}
 */
export async function choisirPhoto(fichier) {
	const resultat = await preparerPhotoNavigateur(fichier)
	if (!resultat.ok) {
		track('upload_error', {
			kind: resultat.raison === 'taille' ? 'size' : 'type',
		})
		toast(resultat.message, {
			type: 'error',
			icon: '⛔',
			toastId: 'photo-refusee',
		})
	}
	return resultat
}

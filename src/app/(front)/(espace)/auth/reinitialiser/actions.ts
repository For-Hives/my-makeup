'use server'

import config from '@payload-config'
import { cookies, headers } from 'next/headers'
import { getPayload } from 'payload'
import type { EtatDeLaReinitialisation } from '@/components/auth/FormulaireDeReinitialisation'
import { journalDe } from '@/lib/auth/journal'
import { COOKIE_DE_REINITIALISATION } from '@/lib/auth/mot-de-passe-oublie'
import { reinitialiserLeMotDePasse } from '@/lib/auth/reinitialisation-payload'

/**
 * The second step of the forgotten password (tickets 085 and 086): the code comes from the cookie
 * the proxy kept it in, never from the form.
 */
export async function choisirLeMotDePasse(
	_precedent: EtatDeLaReinitialisation,
	formulaire: FormData
): Promise<EtatDeLaReinitialisation> {
	const payload = await getPayload({ config })
	const entetes = await headers()
	const origine = entetes.get('origin')
	if (origine !== null && !payload.config.csrf.includes(origine)) return { code: 'service-indisponible' }

	const jar = await cookies()
	const resultat = await reinitialiserLeMotDePasse({
		payload,
		headers: entetes,
		jeton: jar.get(COOKIE_DE_REINITIALISATION)?.value,
		motDePasse: formulaire.get('password'),
		confirmation: formulaire.get('password-confirmation'),
		journal: journalDe(payload),
	})
	if (!resultat.ok) return { code: resultat.code }
	// The cookie is left as it is: it holds a spent code, and deleting it here would make Next render the page
	// again, without a cookie, in place of the confirmation. A reload of the page says « plus valable ».
	return { modifie: true }
}

'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { profileId } from '@/lib/dashboard/my-profile'
import { requestUser } from '@/lib/dashboard/request'
import { markMyQuote } from '@/lib/quote/dashboard'

/**
 * Marks one of her quote requests answered, or takes it back (issue 1003). An action is a public endpoint: the
 * session is read again here, the origin is checked against the origins Payload trusts, and the request must be
 * on the profile of her account, found by her session, never one named by the request. A refusal says nothing:
 * the page simply shows what is stored.
 */
export async function markMyQuoteRequest(form: FormData): Promise<void> {
	const context = await requestUser()
	if (context === null) return
	const { payload, utilisateur: user } = context
	const origin = (await headers()).get('origin')
	if (origin !== null && !payload.config.csrf.includes(origin)) return
	const mine = await profileId(payload, user)
	if (mine === null) return
	const result = await markMyQuote(payload, mine, { id: form.get('id'), status: form.get('status') })
	if (result.ok) revalidatePath('/auth/profil')
}

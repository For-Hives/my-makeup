import { cookies } from 'next/headers'
import { SESSION_COOKIE } from '@/lib/auth/closed-dashboard'
import { requestUser } from '@/lib/dashboard/request'
import { profilePid } from '@/lib/profile/pid'

// Read per request: it depends on the session, and the build has no database.
export const dynamic = 'force-dynamic'

/**
 * The `pid` of the profile of the signed-in makeup artist, or `null` (ticket 144). The public page of a
 * profile is shared and cached, so it cannot know who looks at it: the browser asks here, to leave
 * out the clicks of an artist on her own contacts. The `pid` is the public id the measure counts, found
 * by her session, never one the request gave. Never cached; a request without the session cookie is
 * answered without touching the database.
 */
export async function GET(): Promise<Response> {
	const entetes = { 'Cache-Control': 'private, no-store' }
	if (!(await cookies()).has(SESSION_COOKIE)) return Response.json({ pid: null }, { headers: entetes })
	const contexte = await requestUser()
	if (contexte === null) return Response.json({ pid: null }, { headers: entetes })
	const { docs } = await contexte.payload.find({
		collection: 'profiles',
		depth: 0,
		limit: 1,
		overrideAccess: true,
		pagination: false,
		select: { strapiId: true },
		where: { pro: { equals: contexte.utilisateur.id } },
	})
	const profil = docs[0]
	return Response.json({ pid: profil ? profilePid(profil) : null }, { headers: entetes })
}

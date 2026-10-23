import type { Payload, PayloadRequest } from 'payload'
import { isAdmin } from '../access'

/**
 * The numbers of the dashboard of the admin panel (issue 1005): what the team needs to see before it
 * opens a list. Only counts and dates: no name, email, phone or message text is read here. Read with the
 * rules active, for an account with the role `admin`; anyone else gets `null`.
 */

export interface Overview {
	readonly profiles: { readonly published: number; readonly draft: number; readonly hidden: number }
	/** Accounts that have not confirmed their email. */
	readonly unconfirmedAccounts: number
	readonly alerts: {
		/** Contact messages whose email to the team failed. */
		readonly failedMails: number
		/** Contact messages nobody has answered yet. */
		readonly newMessages: number
		/** Profiles whose zone waits for a decision. */
		readonly zonesToReview: number
	}
	/** The last contact messages: the number, the date, the state. Never the text or the sender. */
	readonly lastMessages: readonly { readonly id: number; readonly date: string; readonly status: string }[]
	/** The last lines of the moderation journal. */
	readonly lastModerations: readonly {
		readonly id: number
		readonly date: string
		readonly action: string
		readonly profile: number
	}[]
}

type User = PayloadRequest['user'] | undefined

export async function readOverview(payload: Payload, user: User): Promise<Overview | null> {
	if (!isAdmin(user)) return null
	const total = (result: { totalDocs: number }): number => result.totalDocs
	const [
		published,
		draft,
		hidden,
		unconfirmedAccounts,
		failedMails,
		newMessages,
		zonesToReview,
		messages,
		moderations,
	] = await Promise.all([
		payload
			.count({ collection: 'profiles', where: { status: { equals: 'published' } }, overrideAccess: false, user })
			.then(total),
		payload
			.count({ collection: 'profiles', where: { status: { equals: 'draft' } }, overrideAccess: false, user })
			.then(total),
		payload
			.count({ collection: 'profiles', where: { status: { equals: 'hidden' } }, overrideAccess: false, user })
			.then(total),
		payload
			.count({ collection: 'pros', where: { _verified: { not_equals: true } }, overrideAccess: false, user })
			.then(total),
		payload
			.count({
				collection: 'contact-requests',
				where: { mailStatus: { equals: 'failed' } },
				overrideAccess: false,
				user,
			})
			.then(total),
		payload
			.count({ collection: 'contact-requests', where: { status: { equals: 'new' } }, overrideAccess: false, user })
			.then(total),
		payload
			.count({ collection: 'profiles', where: { 'zoneReview.reason': { exists: true } }, overrideAccess: false, user })
			.then(total),
		payload.find({
			collection: 'contact-requests',
			depth: 0,
			limit: 5,
			sort: '-createdAt',
			select: { createdAt: true, status: true },
			overrideAccess: false,
			user,
		}),
		payload.find({
			collection: 'moderation-events',
			depth: 0,
			limit: 5,
			sort: '-date',
			overrideAccess: false,
			user,
		}),
	])
	return {
		profiles: { published, draft, hidden },
		unconfirmedAccounts,
		alerts: { failedMails, newMessages, zonesToReview },
		lastMessages: messages.docs.map(({ id, createdAt, status }) => ({ id, date: createdAt, status })),
		lastModerations: moderations.docs.map(({ id, date, action, profile }) => ({ id, date, action, profile })),
	}
}

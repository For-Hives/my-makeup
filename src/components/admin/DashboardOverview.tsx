import type { ServerProps } from 'payload'
import { readOverview } from '../../lib/admin/overview'
import { ACTION_LABELS, type ModerationAction } from '../../lib/profile/moderation'

const STATUS_LABELS: Record<string, string> = {
	new: 'Nouvelle',
	forwarded: 'Transmise à l’équipe',
	answered: 'Répondue',
	spam: 'Spam',
}

const frenchDate = (iso: string): string =>
	new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(
		new Date(iso)
	)

const card = {
	border: '1px solid var(--theme-elevation-150)',
	borderRadius: 4,
	margin: 0,
	minWidth: 0,
	padding: 'var(--base)',
} as const

const link = { display: 'inline-block', minHeight: 44, lineHeight: '44px' } as const

/**
 * Above the collections of the admin panel (issue 1005): the profiles by status, the accounts that have not
 * confirmed, the alerts that need a person, the last contact messages and the last moderations. Admins only;
 * counts and dates, no personal data. Every number is a link to the list it counts.
 */
export async function DashboardOverview({ payload, user }: ServerProps) {
	const overview = await readOverview(payload, user)
	if (overview === null) return null
	const { profiles, unconfirmedAccounts, alerts, lastMessages, lastModerations } = overview
	const profileLink = (status: string) => `/admin/collections/profiles?where[status][equals]=${status}`
	return (
		<section
			aria-labelledby="overview-title"
			data-testid="dashboard-overview"
			style={{ marginBottom: 'calc(var(--base) * 2)' }}
		>
			<h2 id="overview-title" style={{ marginTop: 0 }}>
				Vue d’ensemble
			</h2>
			<div style={{ display: 'grid', gap: 'var(--base)', gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))' }}>
				<div style={card}>
					<h3 style={{ marginTop: 0 }}>Profils</h3>
					<ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
						<li>
							<a href={profileLink('published')} style={link}>
								<strong data-testid="count-published">{profiles.published}</strong> publiés
							</a>
						</li>
						<li>
							<a href={profileLink('draft')} style={link}>
								<strong data-testid="count-draft">{profiles.draft}</strong> brouillons
							</a>
						</li>
						<li>
							<a href={profileLink('hidden')} style={link}>
								<strong data-testid="count-hidden">{profiles.hidden}</strong> masqués ou suspendus
							</a>
						</li>
					</ul>
				</div>
				<div style={card}>
					<h3 style={{ marginTop: 0 }}>Comptes</h3>
					<a href="/admin/collections/pros?where[_verified][not_equals]=true" style={link}>
						<strong data-testid="count-unconfirmed">{unconfirmedAccounts}</strong> non confirmés
					</a>
				</div>
				<div style={card}>
					<h3 style={{ marginTop: 0 }}>À traiter</h3>
					<ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
						<li>
							<a href="/admin/collections/contact-requests?where[status][equals]=new" style={link}>
								<strong data-testid="count-new-messages">{alerts.newMessages}</strong> messages sans réponse
							</a>
						</li>
						<li>
							<a href="/admin/collections/contact-requests?where[mailStatus][equals]=failed" style={link}>
								<strong data-testid="count-failed-mails">{alerts.failedMails}</strong> emails en échec
							</a>
						</li>
						<li>
							<a href="/admin/collections/profiles?where[zoneReview.reason][exists]=true" style={link}>
								<strong data-testid="count-zones">{alerts.zonesToReview}</strong> zones à revoir
							</a>
						</li>
					</ul>
				</div>
			</div>
			<div
				style={{
					display: 'grid',
					gap: 'var(--base)',
					gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))',
					marginTop: 'var(--base)',
				}}
			>
				<div style={card}>
					<h3 style={{ marginTop: 0 }}>Derniers messages</h3>
					{lastMessages.length === 0 ? (
						<p style={{ margin: 0 }}>Aucun message.</p>
					) : (
						<ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
							{lastMessages.map(message => (
								<li key={message.id}>
									<a href={`/admin/collections/contact-requests/${message.id}`} style={link}>
										{frenchDate(message.date)} · {STATUS_LABELS[message.status] ?? message.status}
									</a>
								</li>
							))}
						</ul>
					)}
				</div>
				<div style={card}>
					<h3 style={{ marginTop: 0 }}>Dernières modérations</h3>
					{lastModerations.length === 0 ? (
						<p style={{ margin: 0 }}>Aucune action.</p>
					) : (
						<ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
							{lastModerations.map(line => (
								<li key={line.id}>
									<a href={`/admin/collections/moderation-events/${line.id}`} style={link}>
										{frenchDate(line.date)} · {ACTION_LABELS[line.action as ModerationAction] ?? line.action} · profil
										n° {line.profile}
									</a>
								</li>
							))}
						</ul>
					)}
					<a href="/admin/collections/moderation-events" style={link}>
						Tout le journal
					</a>
				</div>
			</div>
		</section>
	)
}

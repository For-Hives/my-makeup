import type { ServerProps } from 'payload'
import { FILTER_LABELS, type FilterKey, filterLink, filterWhere } from '../../lib/account/admin-filters'

const KEYS: FilterKey[] = ['non-confirmes', 'sans-profil', 'bloques']

/**
 * Above the list of the accounts (ticket 168): how many accounts are unconfirmed, without a profile
 * or blocked, and the link that filters the list on each. The links are filters of the panel (they
 * combine with the others and can be bookmarked). It renders for an admin only: the list itself is
 * closed to everyone else, so the counts read with the rights of the server.
 */
export async function AccountFilters({ payload }: ServerProps) {
	const profiles = await payload.find({
		collection: 'profiles',
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		select: { pro: true },
	})
	const owners = profiles.docs.map(({ pro }) => (typeof pro === 'object' ? pro.id : pro))
	const counts = await Promise.all(
		KEYS.map(cle =>
			payload
				.count({ collection: 'pros', where: filterWhere(cle, owners), overrideAccess: true })
				.then(({ totalDocs }) => totalDocs)
		)
	)
	return (
		<p
			data-testid="filtres-des-comptes"
			style={{ margin: '0 0 var(--base)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}
		>
			{KEYS.map((cle, i) => (
				<a data-testid={`filtre-${cle}`} href={filterLink(cle, owners)} key={cle}>
					{counts[i]} {FILTER_LABELS[cle]}
				</a>
			))}
		</p>
	)
}

import type { ServerProps } from 'payload'

/**
 * Above the list of the contact messages (ticket 163): the number of messages whose mail to the team
 * failed, and the link that filters the list on them. The filter is the one of the panel
 * (`etatMail` equals `echec`), so it can also be combined with the others.
 */
export async function EchecsDEnvoi({ payload, user }: ServerProps) {
	const { totalDocs } = await payload.count({
		collection: 'demandes',
		where: { etatMail: { equals: 'echec' } },
		overrideAccess: false,
		user,
	})
	return (
		<p data-testid="echecs-d-envoi" style={{ margin: '0 0 var(--base)' }}>
			{totalDocs === 0 ? (
				'Aucun email en échec.'
			) : (
				<a href="/admin/collections/demandes?where[etatMail][equals]=echec">
					{totalDocs === 1 ? '1 email en échec' : `${totalDocs} emails en échec`} : voir ces messages
				</a>
			)}
		</p>
	)
}

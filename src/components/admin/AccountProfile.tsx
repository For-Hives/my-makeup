import type { DefaultServerCellComponentProps } from 'payload'

/** The cell « Profil » of the list of accounts (ticket 168): whether the account holds a profile. */
export function AccountProfile({ cellData }: DefaultServerCellComponentProps) {
	const docs = (cellData as { docs?: unknown[] } | null | undefined)?.docs
	return <span>{Array.isArray(docs) && docs.length > 0 ? 'Oui' : 'Non'}</span>
}

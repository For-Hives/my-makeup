/** What a page of the space may know about the makeup artist: never the account document. */
export interface Artist {
	id: number | string
	name: string
	email: string
	/** When her session ends (Unix seconds), read from the cookie; nothing if the token did not come by the cookie. */
	expire: number | null
}

/** The fields of the account document the space reads. */
interface Account {
	id: number | string
	name?: string | null
	email: unknown
}

/** The makeup artist behind an account of the « pros » collection (its display name is the field `name`). */
export function artistFromAccount(account: Account): Artist {
	return { id: account.id, name: account.name ?? '', email: String(account.email), expire: null }
}

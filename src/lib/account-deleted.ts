/**
 * « Ton compte est supprimé » on the home page (ticket 305). Once her account is deleted she lands on the
 * home page, which is cached and the same for everyone: the server cannot tell it she just left. The tab
 * tells it instead, through a flag in the storage of the tab: set when the deletion succeeded, read and
 * cleared by the home page. Nothing goes in the address, and nothing is kept past the first reading. A
 * browser that refuses the storage shows no message, and nothing else changes.
 */

const FLAG = 'mm:account-deleted'

/** The storage of the tab, or nothing when the browser refuses it. */
function tabStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
	try {
		return typeof window === 'undefined' ? null : window.sessionStorage
	} catch {
		return null
	}
}

/** Called once the server has deleted the account, before the browser leaves for the home page. */
export function markAccountDeleted(): void {
	try {
		tabStorage()?.setItem(FLAG, '1')
	} catch {
		// Storage full or refused: the home page says nothing.
	}
}

/** True once after `markAccountDeleted`: the flag is cleared by the reading. */
export function takeAccountDeleted(): boolean {
	try {
		const storage = tabStorage()
		if (storage?.getItem(FLAG) !== '1') return false
		storage.removeItem(FLAG)
		return true
	} catch {
		return false
	}
}

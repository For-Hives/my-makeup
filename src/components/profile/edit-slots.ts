import type { ReactNode } from 'react'

/**
 * What the page of a profile accepts to be drawn editable (issue 1008). Her own page, in edit mode,
 * hands `ProfileView` these functions; each wraps the block the visitor sees (the node it is given)
 * with what only she gets. The public page hands nothing, and then not a single node of the HTML
 * differs from what it was: this file imports nothing of the editing code, which is loaded only by the
 * private route that builds the slots.
 */
export interface HeaderEdit {
	/** The main photo, as the visitor sees it. */
	photo: (read: ReactNode) => ReactNode
	/** Her name, speciality and artist name; `missingSpecialty` when the speciality is empty. */
	identity: (read: ReactNode, state: { missingSpecialty: boolean }) => ReactNode
	/** Her place, or nothing when she gave none. */
	place: (read: ReactNode) => ReactNode
	/** The availability. */
	status: (read: ReactNode) => ReactNode
	/** The place where the open block draws its editor. */
	panel: ReactNode
}

export interface ProfileEdit {
	header: HeaderEdit
}

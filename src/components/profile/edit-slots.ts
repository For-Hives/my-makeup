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

/**
 * What wraps a block of the body of the page (issues 1016 to 1021). It is given the block as the
 * visitor sees it, or `null` when the block has nothing to show: the public page leaves such a block
 * out, her own page keeps it, with an invitation in its place.
 */
export type BlockSlot = (read: ReactNode | null) => ReactNode

/** The blocks of the body of the page she can change; a block without a function is drawn as the visitor sees it. */
export interface BodyEdit {
	/** « À propos », her presentation text. */
	about: BlockSlot
	skills: BlockSlot
	languages: BlockSlot
	courses: BlockSlot
	services: BlockSlot
	gallery: BlockSlot
	/** The sentence of her travels. */
	travel: BlockSlot
	/** Her networks and her website. */
	networks: BlockSlot
	/** Her phone and her contact email, shown only with her dated consent. */
	contacts: BlockSlot
}

export interface ProfileEdit {
	header: HeaderEdit
	body?: Partial<BodyEdit>
}

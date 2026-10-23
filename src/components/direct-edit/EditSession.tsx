'use client'

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { type BarStatus, type BlockSave, barStatus } from '@/lib/direct-edit/save-state'

/**
 * The session of the direct edition (issue 1008): the one block that is open at a time, whether it
 * holds changes not saved, the state of the last save, and the place under the header where the open
 * block draws its editor. It lives on the private page of her own profile only; the public page never
 * loads it.
 *
 * Opening another block, or closing the open one, while it holds changes asks first (« Continuer à
 * modifier » / « Abandonner mes modifications »): nothing she typed is dropped without her say.
 */

export type Confirmation = { next: string | null } | null

interface Session {
	openId: string | null
	dirty: boolean
	save: BlockSave
	status: BarStatus
	confirmation: Confirmation
	slot: HTMLElement | null
	setSlot: (element: HTMLElement | null) => void
	/** Opens a block, or asks first when the open one holds changes. */
	open: (id: string) => void
	/** Closes the open block, or asks first when it holds changes. */
	close: () => void
	/** Throws the changes away and goes where she wanted to go. */
	abandon: () => void
	keepEditing: () => void
	setDirty: (dirty: boolean) => void
	reportSave: (save: BlockSave) => void
	/** The server stored the change: closes the block and reads the page again. */
	saved: () => void
}

const SessionContext = createContext<Session | null>(null)

export function useEditSession(): Session {
	const session = useContext(SessionContext)
	if (session === null) throw new Error('A block of the direct edition must be inside an EditSession.')
	return session
}

export function EditSession({ refresh, children }: { refresh: () => void; children: ReactNode }) {
	const [openId, setOpenId] = useState<string | null>(null)
	const [dirty, setDirtyState] = useState(false)
	const [save, setSave] = useState<BlockSave>({ kind: 'idle' })
	const [confirmation, setConfirmation] = useState<Confirmation>(null)
	const [slot, setSlot] = useState<HTMLElement | null>(null)
	const busy = useRef(false)

	const goTo = useCallback((id: string | null) => {
		setOpenId(id)
		setDirtyState(false)
		setConfirmation(null)
		setSave({ kind: 'idle' })
		busy.current = false
	}, [])

	const open = useCallback(
		(id: string) => {
			if (id === openId || busy.current) return
			if (openId !== null && dirty) setConfirmation({ next: id })
			else goTo(id)
		},
		[openId, dirty, goTo]
	)

	const close = useCallback(() => {
		if (busy.current) return
		if (dirty) setConfirmation({ next: null })
		else goTo(null)
	}, [dirty, goTo])

	const reportSave = useCallback((next: BlockSave) => {
		busy.current = next.kind === 'saving'
		setSave(next)
	}, [])

	// A page left with changes not saved asks the browser to confirm.
	useEffect(() => {
		if (!dirty) return
		const guard = (event: BeforeUnloadEvent) => {
			event.preventDefault()
		}
		window.addEventListener('beforeunload', guard)
		return () => window.removeEventListener('beforeunload', guard)
	}, [dirty])

	const value = useMemo<Session>(
		() => ({
			openId,
			dirty,
			save,
			status: barStatus(openId, save),
			confirmation,
			slot,
			setSlot,
			open,
			close,
			abandon: () => goTo(confirmation?.next ?? null),
			keepEditing: () => setConfirmation(null),
			setDirty: setDirtyState,
			reportSave,
			saved: () => {
				busy.current = false
				setOpenId(null)
				setDirtyState(false)
				setConfirmation(null)
				setSave({ kind: 'saved' })
				refresh()
			},
		}),
		[openId, dirty, save, confirmation, slot, open, close, goTo, reportSave, refresh]
	)
	return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

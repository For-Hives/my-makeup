'use client'

import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { expiredSessionUrl } from '@/lib/auth/return-to'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import { editPath } from '@/lib/direct-edit/edit-mode'
import { type BlockOutcome, type BlockSave, saveFromOutcome } from '@/lib/direct-edit/save-state'
import { useEditSession } from './EditSession'

export const FIELD_CLASS =
	'min-h-11 w-full rounded-2xl border-[1.5px] border-nude-300 bg-blush px-4 py-2 text-base text-ink outline-none focus-visible:border-lipstick focus-visible:outline-2 focus-visible:outline-lipstick'

/**
 * The form every block of the direct edition draws in its editor (issue 1008): the fields, then
 * « Annuler » and « Enregistrer ».
 *
 * - `onSend` runs the save. It gives back the answer of the server, or `null` when nothing was
 *   sent (a field the browser refused first).
 * - Two clicks, or Enter held, send one request: the form refuses the next until the first answered.
 * - The state follows the server: « Enregistrement… » while it works, the block closes and the page is
 *   read again only once it answered « ok ». A failure keeps the editor open with what she typed and
 *   says so, in French, in a `role="alert"`.
 * - A session that ended is told apart: nothing was stored, what she typed stays, and a link opens
 *   the sign-in page in another tab.
 */
export function BlockForm({
	title,
	dirty,
	onSend,
	onFailure,
	disabled = false,
	keepsHint,
	submitLabel = 'Enregistrer',
	children,
}: {
	title: string
	/** The fields hold changes that are not saved. */
	dirty: boolean
	onSend: () => Promise<BlockOutcome | null>
	/** Called with the failure, to put the message of a field under it. */
	onFailure?: (save: Extract<BlockSave, { kind: 'error' }>) => void
	/** The save cannot be asked yet (nothing chosen, a file being prepared). */
	disabled?: boolean
	/** What the session message says stays: « ta photo est toujours là ». */
	keepsHint: string
	/** The words of the button that saves, when the block says more than « Enregistrer » (« Enregistrer cette prestation »). */
	submitLabel?: string
	children: ReactNode
}) {
	const session = useEditSession()
	const [save, setSave] = useState<BlockSave>({ kind: 'idle' })
	const lock = useRef(false)
	const { setDirty } = session
	useEffect(() => {
		setDirty(dirty)
	}, [dirty, setDirty])

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (lock.current || disabled) return
		lock.current = true
		const saving: BlockSave = { kind: 'saving' }
		setSave(saving)
		session.reportSave(saving)
		let next: BlockSave
		try {
			const outcome = await onSend().catch((): BlockOutcome => ({ ok: false, message: FAILURE_MESSAGE }))
			if (outcome === null) {
				setSave({ kind: 'idle' })
				session.reportSave({ kind: 'idle' })
				return
			}
			next = saveFromOutcome(outcome)
		} finally {
			lock.current = false
		}
		if (next.kind === 'saved') {
			session.saved()
			return
		}
		setSave(next)
		session.reportSave(next)
		if (next.kind === 'error') onFailure?.(next)
	}

	const pending = save.kind === 'saving'
	return (
		<form noValidate aria-label={title} aria-busy={pending} onSubmit={submit} className="flex flex-col gap-5">
			{children}
			<div role="alert">
				{save.kind === 'error' || save.kind === 'expired' ? (
					<p className="rounded-2xl bg-lipstick-50 p-4 text-lipstick-800 text-sm">
						{save.message}
						{save.kind === 'expired' ? (
							<>
								{' '}
								<a
									className="font-semibold underline"
									href={expiredSessionUrl(editPath())}
									target="_blank"
									rel="noopener"
								>
									Te reconnecter (nouvel onglet)
								</a>
								, puis reviens ici et enregistre à nouveau : {keepsHint}.
							</>
						) : null}
					</p>
				) : null}
			</div>
			<div className="flex flex-col-reverse gap-3 border-hairline border-t pt-4 sm:flex-row sm:items-center sm:justify-end">
				<button
					type="button"
					onClick={session.close}
					disabled={pending}
					className="min-h-11 w-full rounded-full border border-ink bg-white px-6 font-semibold text-ink text-sm transition-colors hover:bg-nude-100 focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2 disabled:opacity-60 motion-reduce:transition-none sm:w-auto"
				>
					Annuler
				</button>
				<button
					type="submit"
					disabled={pending || disabled}
					className="min-h-11 w-full rounded-full border border-lipstick bg-lipstick px-6 font-semibold text-sm text-white transition-colors hover:bg-lipstick-800 focus-visible:outline-2 focus-visible:outline-lipstick focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none sm:w-auto"
				>
					{pending ? 'Enregistrement…' : submitLabel}
				</button>
			</div>
		</form>
	)
}

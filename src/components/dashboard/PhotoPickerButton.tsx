import type { ChangeEvent, Ref } from 'react'

/**
 * The big button that opens the choice of photos (ticket 306; audit UX n° 23). The native file field
 * stays in the page, hidden from the eye but not from the keyboard nor from a screen reader (`sr-only`,
 * never `display: none`, which would take it out of the tab order), and its label is drawn as the button:
 * a tap on it opens the photo library or the camera of the phone, a keyboard reaches the field itself and
 * the focus ring is drawn on the button.
 *
 * The label is the accessible name of the field (« Ajouter des photos »), and the help text under it is
 * its description.
 */
export function PhotoPickerButton({
	id,
	libelle,
	accept,
	multiple = false,
	disabled,
	aideId,
	inputRef,
	onChange,
}: {
	id: string
	libelle: string
	accept: string
	multiple?: boolean
	disabled: boolean
	/** The id of the paragraph that helps, read after the name. */
	aideId: string
	inputRef?: Ref<HTMLInputElement>
	onChange: (evenement: ChangeEvent<HTMLInputElement>) => void
}) {
	return (
		<div className="relative">
			<input
				ref={inputRef}
				id={id}
				type="file"
				multiple={multiple}
				accept={accept}
				disabled={disabled}
				aria-describedby={aideId}
				onChange={onChange}
				className="peer sr-only"
			/>
			<label
				htmlFor={id}
				className="flex min-h-14 w-full cursor-pointer items-center justify-center before:mr-2 before:content-['+'] rounded-md bg-neutral-900 px-4 py-3 text-center font-semibold text-white peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-600 peer-focus-visible:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-60"
			>
				{libelle}
			</label>
		</div>
	)
}

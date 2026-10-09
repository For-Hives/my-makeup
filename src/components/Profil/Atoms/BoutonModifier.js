/**
 * « Modifier » button of a card of the artist's space (UI-02): always
 * visible, 44 px at least, reachable with the keyboard with a visible focus
 * ring, opened by the first tap. Its accessible name says what it edits.
 */
export default function BoutonModifier({ onClick, libelle, dataCy }) {
	return (
		<button
			type="button"
			data-cy={dataCy}
			onClick={onClick}
			aria-label={libelle}
			title={libelle}
			className={
				'inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-lg border-2 border-indigo-900 bg-white px-3 text-sm font-semibold text-indigo-900 ' +
				'hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2'
			}
		>
			<span className="material-icons-round text-lg" aria-hidden="true">
				edit
			</span>
			<span>Modifier</span>
		</button>
	)
}

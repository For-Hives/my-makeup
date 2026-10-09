import { completude } from '@/lib/profil/completude'

// score out of 13 of the single profile definition (src/lib/profil/completude.js)
function CompletionProfilProgressBar(props) {
	const { score, sur } = completude(props.user)
	const valueToDisplay = Math.round((100 / sur) * score)

	return (
		<div className={'w-full md:w-1/2'}>
			<h2 className="sr-only">{valueToDisplay}% de complétion</h2>
			<p className="text-sm font-medium text-gray-900" data-cy="completion-pourcentage-profil">
				{valueToDisplay}% de complétion
			</p>
			<div className="mt-2 w-full" aria-hidden="true">
				<div className="overflow-hidden rounded-full bg-gray-200">
					<div className="h-2 rounded-full bg-indigo-600" style={{ width: `${valueToDisplay}%` }} />
				</div>
			</div>
		</div>
	)
}

export default CompletionProfilProgressBar

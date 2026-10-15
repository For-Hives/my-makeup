import type { Avancement, Manque } from '@/lib/espace/avancement'

const COULEURS = {
	vide: 'border-neutral-400 bg-neutral-50',
	incomplet: 'border-amber-400 bg-amber-50',
	publiable: 'border-green-600 bg-green-50',
	interne: 'border-neutral-400 bg-neutral-50',
} as const

function Liste({ titre, id, manques }: { titre: string; id: string; manques: readonly Manque[] }) {
	if (manques.length === 0) return null
	return (
		<div>
			<h3 id={id} className="font-semibold text-neutral-800">
				{titre}
			</h3>
			<ul aria-labelledby={id} className="mt-2 flex flex-col gap-1">
				{manques.map(manque => (
					<li key={manque.critere} data-critere={manque.critere}>
						<a className="inline-block min-h-11 py-2 underline" href={`#carte-${manque.section}`}>
							{manque.texte}
						</a>
					</li>
				))}
			</ul>
		</div>
	)
}

/**
 * Where her profile stands, at the top of her space (ticket 138): the percentage, the state, what
 * the state changes, and what she lacks, each point linked to its card. A server component: it
 * shows the reading it is given (`avancementDuProfil`), and the page renders again after each save,
 * so it moves without a reload.
 */
export function AvancementDuProfil({ avancement }: { avancement: Avancement }) {
	const requis = avancement.manques.filter(m => m.requis)
	const autres = avancement.manques.filter(m => !m.requis)
	return (
		<section
			aria-labelledby="avancement-titre"
			data-testid="avancement"
			data-etat={avancement.etat}
			className={`w-full min-w-0 rounded border p-5 sm:p-6 ${COULEURS[avancement.etat]}`}
		>
			<h2 id="avancement-titre" className="font-bold text-neutral-800 text-xl">
				{avancement.titre}
			</h2>
			<div
				role="progressbar"
				aria-label="Complétude de ton profil"
				aria-valuemin={0}
				aria-valuemax={avancement.sur}
				aria-valuenow={avancement.score}
				aria-valuetext={`${avancement.score} sur ${avancement.sur}`}
				className="mt-3 h-3 w-full overflow-hidden rounded-full bg-neutral-200"
			>
				<div className="h-full bg-neutral-900" style={{ width: `${avancement.pourcentage}%` }} />
			</div>
			<p data-testid="avancement-score" className="mt-2 font-medium">
				{avancement.score} sur {avancement.sur} ({avancement.pourcentage} %)
			</p>
			<p data-testid="avancement-consequence" className="mt-2">
				{avancement.consequence}
			</p>
			<div className="mt-4 flex flex-col gap-4">
				<Liste id="avancement-requis" titre="Pour être publiable" manques={requis} />
				<Liste id="avancement-autres" titre="Pour un profil plus complet" manques={autres} />
			</div>
		</section>
	)
}

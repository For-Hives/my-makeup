import { ResumeRequests, type ResumeUpload } from '@/components/dashboard/ResumeRequests'
import {
	bonusText,
	CONTACT_SECTION,
	essentialsText,
	HIDDEN_CONTACT_EMAIL,
	type Missing,
	type Progress,
	pageIsOnline,
	RANKED_LAST_TEXT,
} from '@/lib/dashboard/progress'

const COLORS = {
	vide: 'border-neutral-400 bg-neutral-50',
	incomplet: 'border-amber-400 bg-amber-50',
	publiable: 'border-green-600 bg-green-50',
	interne: 'border-neutral-400 bg-neutral-50',
	masque: 'border-red-700 bg-red-50',
} as const

function List({ titre, id, manques }: { titre: string; id: string; manques: readonly Missing[] }) {
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

/** The sentence of a hidden page, its address as a link to write to. */
function WithMailLink({ texte }: { texte: string }) {
	const [before = '', after = ''] = texte.split(HIDDEN_CONTACT_EMAIL)
	return (
		<>
			{before}
			<a className="inline-block min-h-11 py-2 underline" href={`mailto:${HIDDEN_CONTACT_EMAIL}`}>
				{HIDDEN_CONTACT_EMAIL}
			</a>
			{after}
		</>
	)
}

/**
 * Where her profile stands, at the top of her space (ticket 138): the percentage, the state, what
 * the state changes, and what she lacks, each point linked to its card. A server component: it
 * shows the reading it is given (`profileProgress`), and the page renders again after each save,
 * so it moves without a reload.
 */
export function ProfileProgress({ avancement, reprendre }: { avancement: Progress; reprendre?: ResumeUpload }) {
	const hidden = avancement.etat === 'masque'
	const required = avancement.manques.filter(m => m.requis)
	const others = avancement.manques.filter(m => !m.requis)
	return (
		<section
			aria-labelledby="avancement-titre"
			data-testid="avancement"
			data-etat={avancement.etat}
			className={`w-full min-w-0 rounded border p-5 sm:p-6 ${COLORS[avancement.etat]}`}
		>
			<h2 id="avancement-titre" className="font-bold text-neutral-800 text-xl">
				{avancement.titre}
			</h2>
			<div
				role="progressbar"
				aria-label="Les six points indispensables de ta page"
				aria-valuemin={0}
				aria-valuemax={avancement.essentials.total}
				aria-valuenow={avancement.essentials.done}
				aria-valuetext={`${avancement.essentials.done} sur ${avancement.essentials.total} indispensables`}
				data-grise={hidden ? 'true' : undefined}
				className="mt-3 h-3 w-full overflow-hidden rounded-full bg-neutral-200"
			>
				<div
					className={`h-full ${hidden ? 'bg-neutral-400' : 'bg-neutral-900'}`}
					style={{ width: `${(avancement.essentials.done / avancement.essentials.total) * 100}%` }}
				/>
			</div>
			<p data-testid="avancement-score" className="mt-2 font-medium">
				{essentialsText(avancement.essentials, pageIsOnline(avancement))}
			</p>
			<p data-testid="avancement-bonus" className="text-neutral-700 text-sm">
				{bonusText(avancement.bonus)}
			</p>
			<p data-testid="avancement-consequence" className="mt-2">
				{hidden ? <WithMailLink texte={avancement.consequence} /> : avancement.consequence}
			</p>
			{reprendre && !hidden && <ResumeRequests enPause={avancement.enPause} envoyer={reprendre} />}
			{avancement.rankedLast && (
				<p data-testid="avancement-sans-contact" className="mt-2">
					{RANKED_LAST_TEXT}{' '}
					<a className="inline-block min-h-11 py-2 underline" href={`#carte-${CONTACT_SECTION}`}>
						Ajouter mes coordonnées
					</a>
				</p>
			)}
			{!hidden && (
				<div className="mt-4 flex flex-col gap-4">
					<List id="avancement-requis" titre="Pour être publiable" manques={required} />
					{others.length > 0 ? (
						// Folded (ticket 307): on a phone, thirteen links pushed the cards that matter below 2 400 px.
						<details data-testid="avancement-autres-details">
							<summary className="flex min-h-11 cursor-pointer items-center font-semibold text-neutral-800 underline">
								Pour un profil plus complet ({others.length})
							</summary>
							<List id="avancement-autres" titre="Pour un profil plus complet" manques={others} />
						</details>
					) : null}
				</div>
			)}
		</section>
	)
}

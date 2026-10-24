import { ArrowUpRightIcon, MagnifierIcon, PlaceIcon } from '@/components/blocks/icons'
import { ActivityBadgePill } from '@/components/profile/ActivityBadge'

const STEPS = [
	{ titre: 'Cherchez par événement et par lieu', texte: 'Mariage, soirée, photo : dites quoi et où, en deux champs.' },
	{
		titre: 'Consultez des profils vérifiés',
		texte: 'Portfolio, spécialités et tarifs indicatifs réunis sur une page.',
	},
	{ titre: 'Écrivez en direct à la maquilleuse', texte: 'Sans intermédiaire, et la recherche est gratuite.' },
] as const

function Bar({ className }: { className: string }) {
	return <div className={`h-3 rounded bg-gray-100 ${className}`} />
}

/**
 * What the platform does for a client, at a glance (issue 1066): a drawing made of the components of the site (the
 * search field, a card of a profile with its badge, a contact button) over three lines that say it in words. The
 * drawing is decoration (`aria-hidden`): the three lines carry the meaning. It shows no photo, no name and no
 * number: grey bars stand where a real card has its texts, as in the cards of « Vos projets, nos meilleurs talents ».
 */
export function HeroIllustration() {
	return (
		<div className="mx-auto flex w-full max-w-md flex-col gap-8 px-2 py-2 lg:max-w-lg">
			<div aria-hidden="true" className="relative flex flex-col gap-4 pb-2">
				<div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-xl ring-1 ring-gray-200">
					<MagnifierIcon className="h-5 w-5 shrink-0 text-indigo-900" />
					<span className="font-semibold text-gray-900 text-sm">Mariage</span>
					<span className="h-4 w-px bg-gray-300" />
					<PlaceIcon className="h-5 w-5 shrink-0 text-indigo-900" />
					<Bar className="w-20" />
				</div>
				<div className="ml-6 flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-gray-200 sm:ml-12">
					<div className="flex items-center gap-3">
						<div className="h-14 w-14 shrink-0 rounded-full bg-indigo-100 ring-2 ring-indigo-900/10" />
						<div className="flex flex-1 flex-col gap-2">
							<Bar className="w-3/4" />
							<Bar className="w-1/2" />
						</div>
					</div>
					<div className="flex flex-wrap gap-1.5">
						<Bar className="w-16" />
						<Bar className="w-20" />
						<Bar className="w-12" />
					</div>
					<div>
						<ActivityBadgePill size="small" />
					</div>
				</div>
				<div className="mr-6 flex items-center justify-between gap-3 rounded-2xl bg-indigo-900 px-4 py-3 text-white shadow-xl sm:mr-12">
					<span className="font-bold text-sm">Contacter</span>
					<ArrowUpRightIcon className="h-5 w-5" />
				</div>
			</div>
			<ul className="flex flex-col gap-4">
				{STEPS.map(step => (
					<li key={step.titre}>
						<p className="font-bold text-gray-900">{step.titre}</p>
						<p className="text-gray-700 text-sm leading-6">{step.texte}</p>
					</li>
				))}
			</ul>
		</div>
	)
}

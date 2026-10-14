import { metadonnees } from '@/lib/seo/metadonnees'

export const metadata = metadonnees({
	titre: 'Maquilleuse professionnelle près de chez vous',
	description:
		'Trouvez une maquilleuse professionnelle à domicile près de chez vous, pour un mariage, une soirée ou un shooting. Comparez les profils et les tarifs.',
	repli:
		'Annuaire de maquilleuses professionnelles indépendantes : trouvez celle qui vous correspond, près de chez vous.',
	chemin: '/',
})

export default function HomePage() {
	return (
		<main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
			<h1 className="font-semibold text-4xl">My Makeup</h1>
			<p className="max-w-prose text-lg text-neutral-700">Annuaire de maquilleuses professionnelles indépendantes.</p>
		</main>
	)
}

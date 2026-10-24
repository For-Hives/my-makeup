import { Benefits } from './Benefits'

/** The advantages of the service for the people looking for a makeup artist (CONF-01: no promise the service does not keep). */
export const CLIENT_BENEFITS: readonly { titre: string; description: string }[] = [
	{
		titre: 'Des maquilleuses professionnelles en un seul endroit',
		description:
			'Grâce à My-Makeup, vous trouvez des maquilleuses professionnelles réunies en un seul endroit, avec leur portfolio et leurs spécialités.',
	},
	{
		titre: 'Recherche facile et rapide',
		description:
			'Recherchez par mot-clé (mariage, soirée, artistique...) et par ville pour trouver rapidement les maquilleuses qui vous correspondent.',
	},
	{
		titre: 'Des informations claires',
		description:
			'Chaque profil présente les tarifs indicatifs, les expériences, les formations et les photos des réalisations de la maquilleuse.',
	},
	{
		titre: 'Inspiration',
		description:
			'Nos articles et nos pages par spécialité vous donnent des idées et des repères pour préparer votre projet beauté.',
	},
	{
		titre: 'Gain de temps',
		description:
			'Au lieu de chercher sur plusieurs sites et réseaux, vous comparez les profils, les prix indicatifs et les portfolios au même endroit.',
	},
	{
		titre: 'Une équipe à votre écoute',
		description: 'Une question ou un problème ? Écrivez-nous depuis la page Contact.',
	},
	{
		titre: 'Contact direct',
		description: 'Vous contactez directement la maquilleuse, sans intermédiaire ni frais de mise en relation.',
	},
]

export function ClientBenefits() {
	return (
		<Benefits
			eyebrow="Particulier"
			items={CLIENT_BENEFITS.map(({ titre, description }) => ({ titre, texte: description }))}
		/>
	)
}

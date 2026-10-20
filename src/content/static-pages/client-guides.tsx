import type { GuideContent } from '@/components/static-pages/ClientGuide'

/**
 * The three guides and the page of solutions for the people looking for a makeup artist (ticket 109). The
 * texts are those of the site online on the day of the port, word for word, with the corrections of
 * CONF-01 (plan 01 §1.9). Changing a word here is a change a visitor sees.
 */

export const GUIDE_FIND_AN_ARTIST: GuideContent = {
	image: '/assets/back/maquilleuse_africaine_white.webp',
	titre: (
		<>
			Trouver une maquilleuse, avec&nbsp;
			<span className="text-indigo-900">My&nbsp;Makeup</span>
			&nbsp;ça n&apos;a jamais été aussi simple !
		</>
	),
	description:
		'Découvrez comment naviguer parmi les profils disponibles sur My Makeup et trouver la maquilleuse qui correspond à vos besoins et attentes.',
	titreDeLArticle: 'Trouver la maquilleuse qui vous correspond parmi les profils disponibles : Un guide complet',
	introduction:
		'Que vous prépariez votre mariage, un événement spécial ou que vous souhaitiez simplement vous offrir une session de maquillage professionnel, le choix de la bonne maquilleuse est essentiel pour obtenir le look que vous désirez. Mais avec un si grand nombre de professionnels disponibles, comment faire le bon choix ? Ce guide vous aidera à naviguer parmi les profils disponibles et à trouver la maquilleuse qui vous correspond le mieux.',
	etapes: [
		{
			titre: 'Comprendre vos besoins 🤔',
			texte:
				"Avant de commencer votre recherche, il est important de comprendre ce que vous attendez d'une maquilleuse. Quel est l'événement ? Quel style de maquillage préférez-vous ? Avez-vous des allergies ou des préférences spécifiques en matière de produits ? Prenez le temps de répondre à ces questions avant de commencer votre recherche.",
		},
		{
			titre: 'Utilisez la recherche 🔍',
			texte:
				'Sur la plateforme My-Makeup, vous pouvez rechercher par mot-clé (mariage, soirée, artistique...) et par ville pour affiner votre sélection. Cela vous aidera à réduire le nombre de résultats et à trouver plus facilement la maquilleuse qui vous correspond.',
		},
		{
			titre: 'Consultez les profils 👀',
			texte:
				'Chaque maquilleuse sur My-Makeup a un profil détaillé où vous pouvez en apprendre plus sur son parcours, ses compétences et ses spécialités. Prenez le temps de lire attentivement ces profils pour comprendre ce que chaque maquilleuse a à offrir. Vous pouvez également consulter les photos de leur travail pour avoir une idée de leur style.',
		},
		{
			titre: 'Regardez ses réalisations 🌟',
			texte:
				"Les photos du portfolio sont le meilleur moyen de juger le style d'une maquilleuse. Consultez aussi ses réseaux sociaux lorsqu'elle les indique sur son profil, ainsi que les avis qu'elle a pu recevoir ailleurs : My-Makeup n'affiche pas d'avis clients pour le moment.",
		},
		{
			titre: 'Discutez avec la maquilleuse 💬',
			texte:
				"Une fois que vous avez sélectionné quelques maquilleuses potentielles, prenez le temps de les contacter pour discuter de vos besoins et de vos attentes. C'est l'occasion de poser des questions, de discuter du tarif et de comprendre si vous vous sentez à l'aise avec cette personne. Après tout, le maquillage est une expérience personnelle et il est important de se sentir à l'aise avec la personne qui vous maquillera. En suivant ces étapes, vous serez en mesure de naviguer avec succès parmi les nombreux profils disponibles et de trouver la maquilleuse qui correspond parfaitement à vos besoins et à vos attentes. Bonne recherche !",
		},
	],
}

export const GUIDE_GATHER_SEARCHES: GuideContent = {
	image: '/assets/back/maquilleuse_africaine_white.webp',
	titre: (
		<>
			Centraliser ses recherches avec&nbsp;
			<span className="text-indigo-900">My&nbsp;Makeup</span>
			&nbsp;ça n&apos;a jamais été aussi simple !
		</>
	),
	description:
		'Apprenez comment centraliser et organiser vos recherches pour comparer efficacement les maquilleuses et trouver celle qui vous correspond le mieux.',
	titreDeLArticle: 'Centraliser vos recherches pour trouver la maquilleuse qui vous correspond : Un guide complet',
	introduction:
		"La recherche de la maquilleuse idéale peut parfois ressembler à la recherche d'une aiguille dans une botte de foin. Avec autant de maquilleuses professionnelles disponibles, il est essentiel de centraliser et d'organiser vos recherches pour trouver celle qui vous correspond le mieux. Voici un guide qui vous aidera à structurer vos recherches et à comparer efficacement les maquilleuses.",
	etapes: [
		{
			titre: 'Définissez vos besoins 🎯',
			texte:
				"La première étape consiste à définir clairement vos besoins et attentes. Quel type de maquillage recherchez-vous ? Pour quel type d'événement ? Quel est votre budget ? Quelles sont vos exigences spécifiques (allergies, préférences pour les produits bio, etc.) ? En répondant à ces questions, vous pourrez affiner vos recherches.",
		},
		{
			titre: 'Utilisez une plateforme centralisée 🔍',
			texte:
				"Utilisez une plateforme comme My-Makeup pour centraliser vos recherches. Grâce à sa recherche, vous pouvez trouver des maquilleuses en fonction de deux critères : un mot-clé (spécialité, type d'événement...) et une ville.",
		},
		{
			titre: 'Créez une shortlist 📝',
			texte:
				'Après votre recherche, créez une shortlist des maquilleuses qui correspondent le mieux à vos critères. Consultez attentivement leurs profils pour en savoir plus sur leur parcours, leurs compétences et leurs styles. Prenez en compte leurs photos de travail pour évaluer la qualité de leur travail.',
		},
		{
			titre: 'Comparez les profils 🔄',
			texte:
				'Une fois votre shortlist établie, comparez les profils pour trouver la maquilleuse qui vous correspond le mieux. Prenez en compte tous les aspects : compétences, style, expérience, tarifs, etc. Cette comparaison vous aidera à prendre une décision éclairée.',
		},
		{
			titre: 'Contactez les maquilleuses 💬',
			texte:
				"N'hésitez pas à contacter les maquilleuses de votre shortlist pour discuter de vos besoins et attentes. Posez-leur des questions sur leur disponibilité, leur manière de travailler, les produits qu'elles utilisent, etc. Cette interaction vous aidera à déterminer si vous vous sentez à l'aise avec elles et si elles peuvent répondre à vos attentes.",
		},
		{
			titre: 'Prenez votre décision ✅',
			texte:
				"Après avoir comparé les profils et discuté avec les maquilleuses, il est temps de prendre votre décision. Choisissez la maquilleuse qui répond le mieux à vos critères et qui vous met le plus à l'aise. En centralisant et organisant vos recherches, vous pouvez efficacement comparer les maquilleuses et trouver celle qui correspond le mieux à vos besoins et attentes. Bonne chance dans vos recherches !",
		},
	],
}

export const GUIDE_EXPLORE_PROFILES: GuideContent = {
	image: '/assets/back/maquilleuse_africaine_white.webp',
	titre: (
		<>
			Explorer les profils avec&nbsp;
			<span className="text-indigo-900">My&nbsp;Makeup</span>
			&nbsp;ça n&apos;a jamais été aussi simple !
		</>
	),
	description:
		"Apprenez comment My-Makeup peut vous permettre, via l'exploration des profils des maquilleuses, de trouver celle qui vous correspond le mieux.",
	titreDeLArticle: 'Explorer les profils de maquilleuses sur My-Makeup : Recherche par mot-clé et par ville',
	introduction:
		'La recherche de la maquilleuse idéale peut sembler intimidante, mais My-Makeup facilite ce processus grâce à une recherche par mot-clé et par ville. Voici un guide pour vous aider à explorer les profils des maquilleuses sur notre plateforme.',
	etapes: [
		{
			titre: 'Définissez vos besoins et vos critères 📌',
			texte:
				'Avant de commencer votre recherche, prenez un moment pour définir vos besoins. Cherchez-vous une maquilleuse pour un mariage, une séance photo, un tutoriel de maquillage ou simplement pour un relooking quotidien ? Quel est votre budget ? Quelles sont vos préférences en termes de style de maquillage ? Quels sont vos besoins spécifiques (allergies, préférences pour les produits bio, etc.) ?',
		},
		{
			titre: 'Lancez une recherche par mot-clé 🔎',
			texte:
				'Saisissez un mot-clé, par exemple une spécialité ou un type de prestation (mariage, soirée, artistique...), et, si vous le souhaitez, une ville. My-Makeup vous affiche les profils de maquilleuses qui correspondent à votre recherche.',
		},
		{
			titre: 'Créez une shortlist 📝',
			texte:
				'Après votre recherche, créez une shortlist des maquilleuses qui correspondent le mieux à vos besoins. Consultez attentivement leurs profils pour en savoir plus sur leur parcours, leurs compétences et leurs styles. Les photos de leurs réalisations sont le meilleur moyen de juger de leur travail.',
		},
		{
			titre: 'Recherche par ville 🏙️',
			texte:
				'Indiquer une ville vous permet de trouver des maquilleuses qui exercent près de chez vous ou là où se déroule votre événement. Pensez aussi à vérifier sur chaque profil la zone de déplacement indiquée par la maquilleuse.',
		},
		{
			titre: 'Explorez les profils 📖',
			texte:
				"Une fois vos résultats affichés, prenez le temps d'explorer les profils des maquilleuses. Chaque maquilleuse présente elle-même sur sa page son parcours, ses compétences et son style, ainsi que des photos de son travail et ses tarifs lorsqu'elle les a renseignés.",
		},
		{
			titre: 'Contactez la maquilleuse 💬',
			texte:
				"N'hésitez pas à contacter la maquilleuse qui vous intéresse pour discuter de vos besoins et de vos attentes. C'est l'occasion de lui poser des questions sur son approche du maquillage, ses disponibilités, les produits qu'elle utilise, etc. Cela vous aidera à déterminer si elle est la bonne personne pour vous. En utilisant ces stratégies, vous pouvez explorer les profils sur My-Makeup, effectuer une recherche efficace par mot-clé et par ville, et trouver la maquilleuse idéale pour répondre à vos besoins.",
		},
	],
}

export const GUIDE_CLIENT_SOLUTIONS: GuideContent = {
	image: '/assets/back/maquilleuse_asiatique_white.webp',
	titre: (
		<>
			Trouvez Votre Maquilleuse Idéale avec&nbsp;
			<span className="text-indigo-900">My&nbsp;Makeup&nbsp;</span>
			La solution de vos rêves&nbsp;!
		</>
	),
	description:
		'Découvrez comment My-Makeup vous donne accès à un large éventail de maquilleuses professionnelles pour trouver celle qui vous correspond le mieux.',
	titreDeLArticle:
		"Solutions My-Makeup pour les Particuliers : Trouver la Maquilleuse de vos Rêves n'a Jamais été Aussi Simple !",
	introduction:
		"Nous savons à quel point il peut être difficile de trouver la maquilleuse professionnelle qui répond parfaitement à vos besoins. C'est pourquoi chez My-Makeup, nous avons simplifié ce processus pour vous. Voici comment notre plateforme rend la recherche de la maquilleuse de vos rêves plus facile que jamais.",
	etapes: [
		{
			titre: 'Une recherche simplifiée 🕵️‍♀️',
			texte:
				"Avec notre recherche par mot-clé et par ville, vous pouvez trouver la maquilleuse professionnelle qui correspond à vos besoins en un clin d'œil. Que vous cherchiez une experte en maquillage de mariage, une spécialiste du maquillage bio ou une artiste maquilleuse pour un événement spécial, notre plateforme vous donne accès à un large éventail de profils pour trouver votre perle rare.",
		},
		{
			titre: 'Comparez et choisissez 🔄',
			texte:
				'Sur My-Makeup, vous pouvez consulter les profils détaillés des maquilleuses, y compris leurs portfolios, leurs spécialités et leurs tarifs. Cela vous permet de comparer facilement les différentes options et de choisir celle qui vous convient le mieux.',
		},
		{
			titre: 'Contactez directement la maquilleuse 📅',
			texte:
				'Une fois que vous avez trouvé la maquilleuse qui vous convient, contactez-la directement avec les coordonnées indiquées sur son profil pour convenir ensemble de la prestation, de la date et du tarif.',
		},
		{
			titre: 'Des profils présentés par les maquilleuses 💼',
			texte:
				'Chaque maquilleuse présente elle-même son parcours, ses formations et ses réalisations. My-Makeup ne gère ni les rendez-vous ni les règlements : vous convenez directement avec elle du devis et des modalités.',
		},
		{
			titre: 'Une question ? 📞',
			texte:
				"Si vous avez des questions ou rencontrez un problème, écrivez-nous depuis la page Contact. Nous sommes déterminés à faire de votre expérience avec My-Makeup une expérience positive et sans stress. En somme, My-Makeup simplifie votre recherche de la maquilleuse parfaite. Avec nous, trouver la maquilleuse de vos rêves n'a jamais été aussi simple !",
		},
	],
}

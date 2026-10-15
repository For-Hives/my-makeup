/**
 * The title of the tab and of the search results of the 14 pages `/talent/<slug>` (ticket 108): 50 to 60
 * characters each, different from each other and from the title shown at the top of the page. Bing flags the
 * short titles of these pages. The import copies them into `titreDeLaPage` when a talent has none; a title
 * typed in the admin is never overwritten.
 */
export const TITRES_DES_PAGES_TALENT: Readonly<Record<string, string>> = {
	'maquillage-mariee': 'Maquillage de mariée : trouvez votre maquilleuse pro',
	'maquillage-fete': 'Maquillage de fête : des maquilleuses pour briller ce soir',
	'maquillage-professionnel': 'Maquillage professionnel : maquilleuses indépendantes',
	'maquillage-artistique': 'Maquillage artistique : trouvez une maquilleuse créative',
	'maquillage-homme': 'Maquillage pour homme : maquilleuses et maquilleurs',
	'maquillage-enfant': 'Maquillage enfant : une maquilleuse pour les petits',
	'maquillage-femme': 'Maquillage femme : trouvez votre maquilleuse proche',
	'maquillage-beaute': 'Maquillage beauté : trouvez une maquilleuse professionnelle',
	'maquillage-soiree': 'Maquillage de soirée : réservez une maquilleuse en France',
	'maquillage-film': 'Maquillage de film : maquilleuses pour tournages et courts',
	'maquillage-specialise': 'Maquillage spécialisé : maquilleuses expertes à contacter',
	'maquillage-theatre': 'Maquillage de théâtre : maquilleuses pour la scène en France',
	'maquillage-fx': 'Maquillage FX : maquilleuses effets spéciaux en France',
	'maquillage-cinema': 'Maquillage cinéma : maquilleuses pour le grand écran',
}

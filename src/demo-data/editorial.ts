/**
 * The editorial part of the fictional set (ticket 052): three talents (the pages of a speciality)
 * and three articles of the blog, one of them a draft. Pure data, like ./profils.ts; the loader is
 * ./jeu.ts.
 *
 * Everything is made up: the texts say so, the slugs are fixed, and nothing here is a copy of a
 * page of the site. The slugs are the identity of a document of the set: a load finds a document
 * by its slug and leaves it as it is.
 *
 * Relative imports on purpose: like the collections, this file must load outside of Next.
 */

import type { Article, Talent } from '../payload-types'

/** What the set writes on a talent: what the newsroom writes. */
export type DemoTalent = Required<Pick<Talent, 'title' | 'slug' | 'description' | 'content'>> &
	Pick<Talent, 'seo_title' | 'seo_description'>

/** What the set writes on an article: what the newsroom writes. */
export type DemoArticle = Required<Pick<Article, 'title' | 'slug' | 'author' | 'excerpt' | 'content'>> &
	Pick<Article, 'seo_title' | 'seo_description'> & { statut: 'published' | 'draft' }

/** The signature of every article of the set. */
export const DEMO_AUTHOR = 'La rédaction fictive'

export const DEMO_TALENTS: readonly DemoTalent[] = [
	{
		title: 'Maquillage de mariée',
		slug: 'maquillage-mariee',
		description: 'Un maquillage qui dure de la cérémonie à la dernière danse, pensé avec la mariée.',
		seo_title: 'Maquillage de mariée : trouver une maquilleuse',
		seo_description: 'Des maquilleuses indépendantes pour le jour J : essai, maquillage et retouches.',
		content:
			'## Le maquillage de mariée\n\nTexte fictif du banc de test.\n\nUn essai quelques semaines avant la date permet de choisir les teintes et la tenue. Le jour J, la maquilleuse se déplace et reste le temps des photos si la mariée le souhaite.\n',
	},
	{
		title: 'Maquillage de soirée',
		slug: 'maquillage-soiree',
		description: 'Un teint lumineux et un regard marqué pour une soirée, un gala ou un anniversaire.',
		seo_title: 'Maquillage de soirée : trouver une maquilleuse',
		seo_description: 'Des maquilleuses indépendantes pour vos soirées : teint, regard et lèvres sur mesure.',
		content:
			'## Le maquillage de soirée\n\nTexte fictif du banc de test.\n\nLe maquillage de soirée se travaille à la lumière du soir : un teint frais, des yeux qui accrochent et des lèvres qui tiennent.\n',
	},
	{
		title: 'Maquillage pour la photo',
		slug: 'maquillage-photo',
		description: 'Un maquillage fait pour l’objectif : portraits, books, tournages et défilés.',
		seo_title: 'Maquillage pour la photo : trouver une maquilleuse',
		seo_description: 'Des maquilleuses indépendantes pour vos séances photo, books et tournages.',
		content:
			'## Le maquillage pour la photo\n\nTexte fictif du banc de test.\n\nLa lumière d’un studio ou d’un extérieur change le rendu d’une teinte : la maquilleuse adapte le teint, les contours et les retouches à la séance.\n',
	},
]

export const DEMO_ARTICLES: readonly DemoArticle[] = [
	{
		title: 'Bien préparer sa peau avant un maquillage',
		slug: 'preparer-sa-peau-avant-un-maquillage',
		author: DEMO_AUTHOR,
		excerpt: 'Trois gestes simples pour que le maquillage tienne mieux et se pose uniformément.',
		seo_title: 'Préparer sa peau avant un maquillage',
		seo_description: 'Nettoyer, hydrater et protéger : les trois gestes qui préparent la peau à un maquillage.',
		content:
			'## Préparer sa peau\n\nArticle fictif du banc de test.\n\n1. Nettoyer la peau.\n2. L’hydrater sans excès.\n3. La protéger du soleil.\n',
		statut: 'published',
	},
	{
		title: 'Choisir sa maquilleuse pour un mariage',
		slug: 'choisir-sa-maquilleuse-pour-un-mariage',
		author: DEMO_AUTHOR,
		excerpt: 'Les questions à poser, l’essai et le calendrier, pour un jour J sans mauvaise surprise.',
		seo_title: 'Choisir sa maquilleuse pour un mariage',
		seo_description: 'Essai, déplacement, retouches : ce qu’il faut voir avec la maquilleuse avant le mariage.',
		content:
			'## Choisir sa maquilleuse\n\nArticle fictif du banc de test.\n\nRegarder ses réalisations, demander un essai, fixer les horaires et le déplacement.\n',
		statut: 'published',
	},
	{
		title: 'Les tendances maquillage de la saison',
		slug: 'tendances-maquillage-de-la-saison',
		author: DEMO_AUTHOR,
		excerpt: 'Brouillon en cours de rédaction : il ne doit jamais être visible du public.',
		seo_title: 'Les tendances maquillage de la saison',
		seo_description: 'Brouillon fictif du banc de test.',
		content: '## Les tendances\n\nBrouillon fictif du banc de test, à ne pas publier.\n',
		statut: 'draft',
	},
]

/**
 * The choices of « Pour quel événement ? » on the home page (issue 1013). Each one is a word the search
 * already understands (it looks into the speciality, the skills and the texts of the profiles, with a typo
 * tolerated), sent as `search`; « Autre » sends none, and the search is then by the city alone.
 *
 * No `next` import: read by the page and by the tests.
 */

export interface EventChoice {
	label: string
	/** What is sent as `search`; empty for « Autre ». */
	search: string
}

export const EVENT_CHOICES: readonly EventChoice[] = [
	{ label: 'Mariage', search: 'mariage' },
	{ label: 'Soirée', search: 'soirée' },
	{ label: 'Photo', search: 'photo' },
	{ label: 'Autre', search: '' },
]

import { expect, type Page } from '@playwright/test'

/**
 * Opens the folded group « Pour aller plus loin » of her space (ticket 307), where the cards of the
 * portfolio, skills, courses, experiences, languages and networks live. A closed group hides them: a
 * click on one of their buttons waits for a card nobody can see. Does nothing when it is open.
 */
export async function openFurtherCards(page: Page): Promise<void> {
	const group = page.getByTestId('groupe-plus-loin')
	await expect(group).toBeVisible()
	if (await group.evaluate(element => (element as HTMLDetailsElement).open)) return
	await group.locator('summary').click()
	await expect(group.getByTestId('carte-langues')).toBeVisible()
}

/** « 14 octobre 2026 », in the Paris time zone; '' for a missing or unreadable date. */
export function articleDate(date: string | null): string {
	if (!date) return ''
	const instant = new Date(date)
	if (Number.isNaN(instant.getTime())) return ''
	return instant.toLocaleDateString('fr-FR', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'Europe/Paris',
	})
}

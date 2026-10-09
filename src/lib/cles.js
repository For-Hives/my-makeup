/**
 * Stable React keys for API items and text lines, including repeated values.
 * Prefer a persisted/local id; otherwise use the content and its occurrence.
 * Reordering distinct items keeps their identity rather than their position.
 */
export function avecCles(valeurs) {
	const occurrences = new Map()
	return valeurs.map(valeur => {
		const identite = valeur?.id ?? JSON.stringify(valeur)
		const occurrence = occurrences.get(identite) ?? 0
		occurrences.set(identite, occurrence + 1)
		return { valeur, cle: JSON.stringify([identite, occurrence]) }
	})
}

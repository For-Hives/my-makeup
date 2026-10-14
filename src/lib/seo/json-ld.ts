/** JSON-LD for a script tag (test U50): `<`, `>` and `&` can never close the tag or open an entity. */
export function serializeJsonLd(donnees: unknown): string {
	return JSON.stringify(donnees)
		.replace(/</g, '\\u003c')
		.replace(/>/g, '\\u003e')
		.replace(/&/g, '\\u0026')
		.replaceAll(' ', '\\u2028')
		.replaceAll(' ', '\\u2029')
}

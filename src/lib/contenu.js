/**
 * HTML of a talent or an article (Markdown of Strapi through remark): its
 * « # titre » become h2, the page title stays the only h1 (SEO-10, the talent
 * pages had 2 h1).
 * @param {unknown} html
 * @returns {string}
 */
export function retrograderTitres(html) {
	if (typeof html !== 'string') return ''
	return html
		.replace(/<h1(\s[^>]*)?>/gi, (_, attributs = '') => `<h2${attributs}>`)
		.replace(/<\/h1\s*>/gi, '</h2>')
}

const X2JS = require('x2js')
describe('Test des pages', () => {
	it('page par defauts - verifie si cypress marche', () => {
		cy.visit('http://localhost:3000/')
	})

	it('verifie si le sitemap a le bon format', () => {
		cy.request('/sitemap.xml')
			.its('body')
			.then(body => {
				const x2js = new X2JS()
				const json = x2js.xml2js(body)
				// get all URLs from the sitemap
				expect(json.urlset.url).to.be.an('array').and.have.length.gt(0)

				json.urlset.url.forEach(url => {
					const parsed = new URL(url.loc)
					cy.log(parsed.pathname)
					// check if the resource exists AND download it
					cy.request(url.loc).its('status').should('eq', 200)
				})
			})
	})
})

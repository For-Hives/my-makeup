const X2JS = require('x2js')
describe('Test des pages', () => {
	it('page par defauts - verifie si cypress marche', () => {
		cy.visit('http://localhost:3000/')

		cy.get('h1').contains('My-Makeup')
		cy.get('h2').contains('Trouvez la maquilleuse de vos rêves')
		cy.percySnapshot('Home Page')
	})

	it('verifie si le sitemap a le bon format', () => {
		cy.request('/sitemap.xml')
			.its('body')
			.then(body => {
				const x2js = new X2JS()
				const json = x2js.xml2js(body)
				// get all URLs from the sitemap
				expect(json.urlset.url).to.be.an('array').and.have.length.gt(0)

				// get all URLs from the sitemap
				expect(json.urlset.url).to.be.an('array').and.have.length.gt(0)

				// todo : check if each URL is valid

				// json.urlset.url.forEach((url) => {
				// 	const parsed = new URL('http://localhost:3000' + url.loc);
				// 	cy.log(parsed.pathname);
				//
				// 	// check if the resource exists
				// 	cy.request('HEAD', url.loc).its('status').should('eq', 200);
				// 	// check if the resource exists AND download it
				// 	cy.request(url.loc).its('status').should('eq', 200);
				// 	// visit the page to check if it loads in the browser
				// 	cy.visit(url.loc).wait(1000, { log: false });
				// });
			})
	})
})

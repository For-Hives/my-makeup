describe('Test des pages', () => {
	it('page par defauts - verifie si cypress marche', () => {
		cy.visit('http://localhost:3000/')
	})
})

describe('test de la page de recherche', () => {
	it('Recherche par terme uniquement', () => {
		cy.visit('http://localhost:3000/search')
		cy.get("[data-cy='search-input']").click()
		cy.get("[data-cy='search-input']").type('Test')
		cy.get("[data-cy='search-button']").click()
		// at least one result
		cy.get("[data-cy='search-result']").first().should('exist')
	})

	it('Recherche par terme et par ville', () => {
		cy.visit('http://localhost:3000/search')
		cy.get("[data-cy='search-input']").click()
		cy.get("[data-cy='search-input']").type('Test')
		cy.get("[data-cy='city-input']").type('Nantes')
		cy.get("[data-cy='search-button']").click()
		// at least one result
		cy.get("[data-cy='search-result']").first().should('exist')
	})
})

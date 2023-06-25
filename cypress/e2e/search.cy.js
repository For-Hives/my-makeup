describe('test', () => {
	it('tests test', () => {
		cy.visit('http://localhost:3000/search')
		cy.get("[data-cy='search-input']").click()
		cy.get("[data-cy='search-input']").type('Test')
		cy.get("[data-cy='city-input']").type('Nantes')
		cy.get("[data-cy='search-button']").click()
		// at least one result
		cy.get("[data-cy='search-result']").first().should('exist')
	})
})

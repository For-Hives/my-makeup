describe('profil', () => {
	beforeEach(() => {
		cy.intercept('POST', '/api/auth/callback/credentials?').as('getCredentials')

		cy.visit('http://localhost:3000/auth/signin')
		cy.get("[data-cy='email-input']").click()
		cy.get("[data-cy='email-input']").type(Cypress.env('TEST_USER'))
		cy.get("[data-cy='password-input']").type(Cypress.env('TEST_PW'))
		cy.get("[data-cy='email-signin']").click()

		cy.wait('@getCredentials').its('response.statusCode').should('eq', 200)
	})

	afterEach(() => {
		cy.get("[data-cy='button-logout']").click()
	})

	describe('Resume - section', () => {
		it('tests complet Resume - section', () => {
			cy.visit('http://localhost:3000/auth/profil')

			// prepare the file to upload
			cy.fixture('./assets/profil.png', { encoding: null }).as('profilPicture')

			// prepare to intercept the request
			cy.intercept('POST', 'https://api.my-makeup.fr/api/upload').as('upload')
			cy.intercept('PATCH', 'https://api.my-makeup.fr/api/me-makeup').as(
				'updateUser'
			)

			// 	open the modal
			cy.get("[data-cy='update-resume-button']")
				.click({ force: true })
				.then(() => {
					//  update profil picture
					cy.get("[data-cy='file-main-upload']").selectFile('@profilPicture', {
						force: true,
					})

					//  update name and last name
					cy.get("[data-cy='first-name-input']").type('Breval')
					cy.get("[data-cy='last-name-input']").type('LE FLOCH')

					//  update speciality
					cy.get("[data-cy='speciality-input']")
						.clear()
						.type(
							'Maquilleur professionnel et coiffeur professionnel pour le cinéma'
						)

					// switch availability to true
					// cy.get('[data-cy=\'available-input\']').click();   // todo : check the aivailability switch

					cy.get("[data-cy='save-resume-button']")
						.click()
						.then(() => {
							// wait for the upload to finish
							cy.wait('@upload').its('response.statusCode').should('eq', 200)
							cy.wait('@updateUser')
								.its('response.statusCode')
								.should('eq', 200)
						})
				})
		})
	})

	describe('Description - section', () => {
		it('tests complet Description - section', () => {
			cy.visit('http://localhost:3000/auth/profil')

			cy.intercept('PATCH', 'https://api.my-makeup.fr/api/me-makeup').as(
				'updateDescription'
			)

			cy.get("[data-cy='update-description-button']")
				.click({ force: true })
				.then(() => {
					const description =
						"Je suis une maquilleuse passionnée avec plus de 10 ans d'expérience..."
					cy.get("[data-cy='description-input']").clear().type(description)

					cy.get("[data-cy='save-description-button']")
						.click()
						.then(() => {
							cy.wait('@updateDescription')
								.its('response.statusCode')
								.should('eq', 200)
						})
				})
		})
	})
})

// describe('Location - section', () => {
// 	it('tests complet Location - section', () => {
// 		cy.visit('http://localhost:3000/auth/profil')
// 		//
// 		// // prepare the file to upload
// 		// cy.fixture('./assets/profil.png', { encoding: null }).as('profilPicture')
// 		//
// 		// // prepare to intercept the request
// 		// cy.intercept('POST', 'https://api.my-makeup.fr/api/upload').as('upload')
// 		// cy.intercept('PATCH', 'https://api.my-makeup.fr/api/me-makeup').as(
// 		// 	'updateUser'
// 		// )
//
// 		// 	open the modal
// 		cy.get("[data-cy='update-location-button']")
// 			.click({ force: true })
// 			.then(() => {
// 				// update name and last name
// 				cy.get("[data-cy='city-input']").type('Nantes')
// 				cy.get("[data-cy='action-radius-input']").type('5')
//
// 				// save the location
// 				cy.get("[data-cy='save-button']")
// 					.click()
// 					.then(() => {
// 						// wait for the upload to finish
// 						cy.wait('@upload').its('response.statusCode').should('eq', 200)
// 						cy.wait('@updateUser')
// 							.its('response.statusCode')
// 							.should('eq', 200)
// 					})
// 			})
// 	})
// })
//
// describe('Skills - section', () => {
// 	it('tests complet Skills - section', () => {
// 		cy.visit('http://localhost:3000/auth/profil')
//
// 		// open the modal
// 		cy.get("[data-cy='update-skills-button']")
// 			.click({ force: true })
// 			.then(() => {
// 				// update skills
// 				cy.get("[data-cy='skills-input']").type('pieds')
// 				cy.type('{enter}')
//
// 				// save the skills
// 				cy.get("[data-cy='save-skills']")
// 					.click()
// 					.then(() => {
// 						// prepare to intercept the request
// 						cy.intercept(
// 							'PATCH',
// 							'https://api.my-makeup.fr/api/me-makeup'
// 						).as('updateUser')
//
// 						// wait for the update to finish
// 						cy.wait('@updateUser')
// 							.its('response.statusCode')
// 							.should('eq', 200)
// 					})
// 			})
// 	})
// })
//
// describe('Diplomas and courses - section', () => {
// 	it('tests complet Diplomas and courses - section', () => {
// 		cy.visit('http://localhost:3000/auth/profil')
//
// 		cy.get("[data-cy='update-diplomas-button']")
// 			.click({ force: true })
// 			.then(() => {
// 				cy.get("[data-cy='diploma-input']").type('Epsi')
// 				cy.get("[data-cy='school-input']").type('epsi')
// 				cy.get("[data-cy='date-graduation-input']").type('2022-12-15')
// 				cy.get("[data-cy='course-description-input']").type('informatique')
//
// 				cy.get("[data-cy='add-course-button']")
// 					.click()
// 					.then(() => {
// 						cy.intercept('POST', 'https://api.my-makeup.fr/api/me-makeup').as(
// 							'addDiploma'
// 						)
//
// 						cy.wait('@addDiploma')
// 							.its('response.statusCode')
// 							.should('eq', 200)
// 					})
// 			})
// 	})
// })
//
// describe('Professional experience - section', () => {
// 	it('tests complet Professional experience - section', () => {
// 		cy.visit('http://localhost:3000/auth/profil')
//
// 		cy.get("[data-cy='update-experience-button']")
// 			.click({ force: true })
// 			.then(() => {
// 				cy.get("[data-cy='company-input']").type('RCA')
// 				cy.get("[data-cy='job-name-input']").type('dev')
// 				cy.get("[data-cy='city-input']").type('Nantes')
// 				cy.get("[data-cy='date-start-input']").type('2021-05-01')
// 				cy.get("[data-cy='date-end-input']").type('2023-05-01')
// 				cy.get("[data-cy='description-experience-input']").type(
// 					'Développement web'
// 				)
//
// 				cy.get("[data-cy='add-experience-button']")
// 					.click()
// 					.then(() => {
// 						cy.intercept('POST', 'https://api.my-makeup.fr/api/me-makeup').as(
// 							'addExperience'
// 						)
//
// 						cy.wait('@addExperience')
// 							.its('response.statusCode')
// 							.should('eq', 200)
// 					})
// 			})
// 	})
// })

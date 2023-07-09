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

	// fixme : reactivate when all tests are done
	// afterEach(() => {
	// 	cy.get("[data-cy='button-logout']").click()
	// })

	// 10 tests ( 10 components )
	describe('Resume - section', () => {
		it('tests complet Resume - section', () => {
			cy.visit('http://localhost:3000/auth/profil')

			// prepare the file to upload
			cy.fixture('./assets/profil.png', { encoding: null }).as('profilPicture')

			// prepare to intercept the request
			cy.intercept('POST', 'https://api.my-makeup.fr/api/upload').as('upload')
			cy.intercept('PATCH', 'https://api.my-makeup.fr/api/me-makeup').as(
				'updateUserResume'
			)

			cy.wait(1000)

			// 	open the modal
			cy.get("[data-cy='update-resume-button']")
				.click({ force: true })
				.then(() => {
					//  update profil picture
					cy.get("[data-cy='file-main-upload']").selectFile('@profilPicture', {
						force: true,
					})

					//  update name and last name
					cy.get("[data-cy='first-name-input']").clear().type('Breval')
					cy.get("[data-cy='last-name-input']").clear().type('LE FLOCH')

					//  update speciality
					cy.get("[data-cy='speciality-input']")
						.clear()
						.type(
							'Maquilleur professionnel et coiffeur professionnel pour le cinéma'
						)

					//  update company-artist
					cy.get("[data-cy='company-artist-input']")
						.clear()
						.type('My Makeup Artist')

					// switch availability to true
					// cy.get('[data-cy=\'available-input\']').click();   // todo : check the aivailability switch

					cy.get("[data-cy='save-button-resume']")
						.click()
						.then(() => {
							// prepare to intercept the request
							cy.intercept(
								'PATCH',
								'https://api.my-makeup.fr/api/me-makeup'
							).as('updateUserResume')

							// wait for the update to finish
							cy.wait('@updateUserResume')
								.its('response.statusCode')
								.should('eq', 200)
						})
				})
		})
	})

	describe('Description - section', () => {
		it('tests complet Description - section', () => {
			cy.visit('http://localhost:3000/auth/profil')

			// prepare to intercept the request
			cy.intercept('PATCH', 'https://api.my-makeup.fr/api/me-makeup').as(
				'updateUserDescription'
			)

			cy.wait(1000)

			cy.get("[data-cy='update-description-button']")
				.click({ force: true })
				.then(() => {
					const description =
						"Je suis une maquilleuse passionnée avec plus de 10 ans d'expérience..."
					cy.get("[data-cy='description-input']").clear().type(description)

					cy.get("[data-cy='save-button-description']")
						.click()
						.then(() => {
							// prepare to intercept the request
							cy.intercept(
								'PATCH',
								'https://api.my-makeup.fr/api/me-makeup'
							).as('updateUserDescription')

							// wait for the update to finish
							cy.wait('@updateUserDescription')
								.its('response.statusCode')
								.should('eq', 200)
						})
				})
		})
	})

	describe('Location - section', () => {
		it('tests complet Location - section', () => {
			cy.visit('http://localhost:3000/auth/profil')

			// prepare to intercept the request
			cy.intercept('PATCH', 'https://api.my-makeup.fr/api/me-makeup').as(
				'updateUserLocation'
			)

			cy.wait(1000)

			// 	open the modal
			cy.get("[data-cy='update-location-button']")
				.click({ force: true })
				.then(() => {
					// update name and last name
					cy.get("[data-cy='city-input']").clear().type('Nantes')
					cy.get("[data-cy='action-radius-input']").clear().type('5')

					cy.get("[data-cy='save-button-location']")
						.click()
						.then(() => {
							// prepare to intercept the request
							cy.intercept(
								'PATCH',
								'https://api.my-makeup.fr/api/me-makeup'
							).as('updateUserLocation')

							// wait for the update to finish
							cy.wait('@updateUserLocation')
								.its('response.statusCode')
								.should('eq', 200)
						})
				})
		})
	})

	describe('Skills - section', () => {
		it('tests complet Skills - section', () => {
			cy.visit('http://localhost:3000/auth/profil')

			// prepare to intercept the request
			cy.intercept('PATCH', 'https://api.my-makeup.fr/api/me-makeup').as(
				'updateUserSkills'
			)

			cy.wait(1000)

			// open the modal
			cy.get("[data-cy='update-skills-button']")
				.click({ force: true })
				.then(() => {
					cy.get('body').then($body => {
						if ($body.find("[data-cy='skill-selected']").length > 0) {
							cy.get("[data-cy='skill-selected']").each(($el, index, $list) => {
								cy.wrap($el).click()
							})
						}
						// update skills
						cy.get("[data-cy='skills-input']")
							.clear()
							.type('pieds')
							.type('{enter}')

						cy.get("[data-cy='save-button-skills']")
							.click()
							.then(() => {
								// prepare to intercept the request
								cy.intercept(
									'PATCH',
									'https://api.my-makeup.fr/api/me-makeup'
								).as('updateUserSkills')

								// wait for the update to finish
								cy.wait('@updateUserSkills')
									.its('response.statusCode')
									.should('eq', 200)
							})
					})
				})
		})
	})

	describe('Diplomas and Courses - section', () => {
		it('tests complet Diplomas and courses - section', () => {
			cy.visit('http://localhost:3000/auth/profil')

			// prepare to intercept the request
			cy.intercept('PATCH', 'https://api.my-makeup.fr/api/me-makeup').as(
				'updateUserCourses'
			)

			cy.wait(1000)

			cy.get("[data-cy='update-courses-button']")
				.click({ force: true })
				.then(() => {
					cy.get('body').then($body => {
						if ($body.find("[data-cy='course-delete-button']").length > 0) {
							cy.get("[data-cy='course-delete-button']").each(
								($el, index, $list) => {
									cy.wrap($el).click()
								}
							)
						}
						cy.get("[data-cy='diploma-input']").clear().type('Epsi')
						cy.get("[data-cy='school-input']").clear().type('epsi')
						cy.get("[data-cy='date-graduation-input']")
							.clear()
							.type('2022-12-15')
						cy.get("[data-cy='course-description-input']")
							.clear()
							.type('informatique')

						cy.get("[data-cy='add-course-button']")
							.click()
							.then(() => {
								cy.get("[data-cy='save-button-courses']")
									.click()
									.then(() => {
										// prepare to intercept the request
										cy.intercept(
											'PATCH',
											'https://api.my-makeup.fr/api/me-makeup'
										).as('updateUserCourses')

										// wait for the update to finish
										cy.wait('@updateUserCourses')
											.its('response.statusCode')
											.should('eq', 200)
									})
							})
					})
				})
		})
	})

	describe('Professional Experiences - section', () => {
		it('tests complet Professional experience - section', () => {
			cy.visit('http://localhost:3000/auth/profil')

			// prepare to intercept the request
			cy.intercept('PATCH', 'https://api.my-makeup.fr/api/me-makeup').as(
				'updateUserExperiences'
			)

			cy.wait(1000)

			cy.get("[data-cy='update-experience-button']")
				.click({ force: true })
				.then(() => {
					cy.get('body').then($body => {
						if ($body.find("[data-cy='experience-selected']").length > 0) {
							cy.get("[data-cy='experience-selected']").each(
								($el, index, $list) => {
									cy.wrap($el).click()
								}
							)
						}

						// update experience
						cy.get("[data-cy='company-input']").clear().type('RCA')
						cy.get("[data-cy='job-name-input']").clear().type('dev')
						cy.get("[data-cy='city-input']").clear().type('Nantes')
						cy.get("[data-cy='date-start-input']").clear().type('2021-05-01')
						cy.get("[data-cy='date-end-input']").clear().type('2023-05-01')
						cy.get("[data-cy='description-experience-input']")
							.clear()
							.type('Développement web')

						cy.get("[data-cy='add-experience-button']")
							.click({
								force: true,
							})
							.then(() => {
								cy.get("[data-cy='save-button-experience']")
									.click()
									.then(() => {
										// prepare to intercept the request
										cy.intercept(
											'PATCH',
											'https://api.my-makeup.fr/api/me-makeup'
										).as('updateUserExperiences')

										// wait for the update to finish
										cy.wait('@updateUserExperiences')
											.its('response.statusCode')
											.should('eq', 200)
									})
							})
					})
				})
		})
	})

	describe('Languages - section', () => {
		it('tests complet Languages - section', () => {
			cy.visit('http://localhost:3000/auth/profil')

			// prepare to intercept the request
			cy.intercept('PATCH', 'https://api.my-makeup.fr/api/me-makeup').as(
				'updateUserLanguages'
			)

			cy.wait(1000)

			cy.get("[data-cy='update-languages-button']")
				.click({ force: true })
				.then(() => {
					cy.get('body').then($body => {
						if ($body.find("[data-cy='language-selected']").length > 0) {
							cy.get("[data-cy='language-selected']").each(
								($el, index, $list) => {
									cy.wrap($el).click()
								}
							)
						}

						// update experience
						cy.get("[data-cy='language-input']")
							.clear()
							.type('Anglais')
							.type('{enter}')

						cy.get("[data-cy='save-button-languages']")
							.click({
								force: true,
							})
							.then(() => {
								// prepare to intercept the request
								cy.intercept(
									'PATCH',
									'https://api.my-makeup.fr/api/me-makeup'
								).as('updateUserLanguages')

								// wait for the update to finish
								cy.wait('@updateUserLanguages')
									.its('response.statusCode')
									.should('eq', 200)
							})
					})
				})
		})
	})

	describe('Social Medias - section', () => {
		it('tests complet Social Medias - section', () => {
			cy.visit('http://localhost:3000/auth/profil')

			// prepare to intercept the request
			cy.intercept('PATCH', 'https://api.my-makeup.fr/api/me-makeup').as(
				'updateUserSocialMedias'
			)

			cy.wait(1000)

			cy.get("[data-cy='update-social-medias-button']")
				.click({ force: true })
				.then(() => {
					cy.get("[data-cy='email-input']").clear().type('test@test.test')

					cy.get("[data-cy='facebook-input']")
						.clear()
						.type('https://facebook.com')

					cy.get("[data-cy='instagram-input']")
						.clear()
						.type('https://instagram.com')

					cy.get("[data-cy='linkedin-input']")
						.clear()
						.type('https://linkedin.com')

					cy.get("[data-cy='phone-input']").clear().type('0606060606')

					cy.get("[data-cy='website-input']")
						.clear()
						.type('https://my-makeup.fr')

					cy.get("[data-cy='youtube-input']")
						.clear()
						.type('https://youtube.com')

					cy.get("[data-cy='save-button-social-medias']")
						.click({
							force: true,
						})
						.then(() => {
							// prepare to intercept the request
							cy.intercept(
								'PATCH',
								'https://api.my-makeup.fr/api/me-makeup'
							).as('updateUserSocialMedias')

							// wait for the update to finish
							cy.wait('@updateUserSocialMedias')
								.its('response.statusCode')
								.should('eq', 200)
						})
				})
		})
	})

	// 	todo Portefolio
	// 	todo Services offers
})

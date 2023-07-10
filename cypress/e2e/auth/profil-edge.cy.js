describe('profil-edge', () => {
	beforeEach(() => {
		cy.intercept('POST', '/api/auth/callback/credentials?').as('getCredentials')
		// post me makeup , reset all the fields
		cy.intercept('PATCH', 'https://api.my-makeup.fr/api/me-makeup').as(
			'patchMeMakeup'
		)

		cy.visit('http://localhost:3000/auth/signin')
		cy.get("[data-cy='email-input']").click()
		cy.get("[data-cy='email-input']").type(Cypress.env('TEST_USER'))
		cy.get("[data-cy='password-input']").type(Cypress.env('TEST_PW'))
		cy.get("[data-cy='email-signin']").click()

		cy.wait('@getCredentials').its('response.statusCode').should('eq', 200)
	})

	// afterEach(() => {
	// 	cy.get("[data-cy='button-logout']").click()
	// })

	// 10 tests ( 10 components )
	describe('Resume - section (min, max, required)', () => {
		it('tests complet Resume - section', () => {
			cy.visit('http://localhost:3000/auth/profil')

			// prepare the file to upload
			cy.fixture('./assets/profil.png', { encoding: null }).as('profilPicture')

			// prepare to intercept the request
			cy.intercept('POST', 'https://api.my-makeup.fr/api/upload').as('upload')

			cy.wait(250)

			// 	open the modal
			cy.get("[data-cy='update-resume-button']")
				.click({ force: true })
				.then(() => {
					//  update profil picture
					cy.get("[data-cy='file-main-upload']").selectFile('@profilPicture', {
						force: true,
					})

					// part to clean the inputs
					//  update name and last name
					cy.get("[data-cy='first-name-input']").clear()
					cy.get("[data-cy='last-name-input']").clear()

					//  update speciality
					cy.get("[data-cy='speciality-input']").clear()

					//  update company-artist
					cy.get("[data-cy='company-artist-input']").clear()

					cy.get("[data-cy='save-button-resume']")
						.click()
						.then(() => {
							cy.get("[data-cy='error-first-name']").should(
								'contain',
								'Le prénom est requis'
							)
							cy.get("[data-cy='error-last-name']").should(
								'contain',
								'Le nom est requis'
							)
						})

					cy.wait(500)

					// check if the max is ok too
					cy.get("[data-cy='first-name-input']").clear().type('a'.repeat(71))
					cy.get("[data-cy='last-name-input']").clear().type('a'.repeat(71))

					//  update speciality
					cy.get("[data-cy='speciality-input']").clear().type('a'.repeat(71))

					//  update company-artist
					cy.get("[data-cy='company-artist-input']")
						.clear()
						.type('a'.repeat(71))

					cy.get("[data-cy='save-button-resume']")
						.click()
						.then(() => {
							cy.get("[data-cy='error-first-name']").should(
								'contain',
								'Le prénom ne doit pas dépasser 70 caractères.'
							)
							cy.get("[data-cy='error-last-name']").should(
								'contain',
								'Le nom ne doit pas dépasser 70 caractères.'
							)
							cy.get("[data-cy='error-speciality']").should(
								'contain',
								'La spécialité ne doit pas dépasser 70 caractères.'
							)
							cy.get("[data-cy='error-company-artist-name']").should(
								'contain',
								"Le nom de l'entreprise ne doit pas dépasser 70 caractères."
							)
						})

					// part to set the user
					//  update name and last name
					cy.get("[data-cy='first-name-input']").clear().type('Utilisateur')
					cy.get("[data-cy='last-name-input']").clear().type('DE TEST')

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
							// wait for the update to finish
							cy.wait('@patchMeMakeup')
								.its('response.statusCode')
								.should('eq', 200)
						})
				})
		})
	})

	/**
	 *  open the modal
	 *  update description with a too long description
	 *  check if the error max is displayed
	 *  update description with an empty description
	 *  check if the update is ok
	 *  update description normally
	 *  check if the update is ok
	 */
	describe('Description - section - (min, max, required)', () => {
		it('tests complet Description - section', () => {
			cy.visit('http://localhost:3000/auth/profil')

			cy.wait(250)

			cy.get("[data-cy='update-description-button']")
				.click({ force: true })
				.then(() => {
					const description =
						"Je suis une maquilleuse passionnée avec plus de 10 ans d'expérience..."

					cy.get("[data-cy='description-input']")
						.invoke('val', 'a'.repeat(2000))
						.type('!')
						.invoke('val')
						.should('have.length', 2001)

					cy.get("[data-cy='save-button-description']")
						.click()
						.then(() => {
							cy.get("[data-cy='error-description']").should(
								'contain',
								'La description ne doit pas dépasser 2000 caractères.'
							)

							cy.get("[data-cy='description-input']").clear()

							cy.get("[data-cy='save-button-description']")
								.click()
								.then(() => {
									cy.wait('@patchMeMakeup')
										.its('response.statusCode')
										.should('eq', 200)

									cy.get("[data-cy='update-description-button']")
										.click({ force: true })
										.then(() => {
											cy.get("[data-cy='description-input']")
												.clear()
												.type(description)

											cy.get("[data-cy='save-button-description']")
												.click()
												.then(() => {
													cy.wait('@patchMeMakeup')
														.its('response.statusCode')
														.should('eq', 200)
												})
										})
								})
						})
				})
		})
	})

	/**
	 * open the modal
	 * update city & action radius with a too long city & action radius
	 * check if the error max is displayed
	 * update city & action radius with an empty city & action radius
	 * check if the update is ok
	 * update city & action radius normally
	 * check if the update is ok
	 */
	describe('Location - section - (min, max, required)', () => {
		it('tests complet Location - section', () => {
			cy.visit('http://localhost:3000/auth/profil')

			cy.wait(250)

			cy.get("[data-cy='update-location-button']")
				.click({ force: true })
				.then(() => {
					// update name and last name
					cy.get("[data-cy='city-input']").clear().type('a'.repeat(71))
					cy.get("[data-cy='action-radius-input']").clear().type('1'.repeat(11))

					cy.get("[data-cy='save-button-location']")
						.click()
						.then(() => {
							cy.get("[data-cy='error-city']").should(
								'contain',
								'La localisation ne doit pas dépasser 70 caractères.'
							)
							cy.get("[data-cy='error-action-radius']").should(
								'contain',
								"Le rayon d'action ne doit pas dépasser 10 caractères."
							)

							// update name and last name
							cy.get("[data-cy='city-input']").clear()
							cy.get("[data-cy='action-radius-input']").clear()

							cy.get("[data-cy='save-button-location']")
								.click()
								.then(() => {
									// wait for the update to finish
									cy.wait('@patchMeMakeup')
										.its('response.statusCode')
										.should('eq', 200)

									// 	open the modal
									cy.get("[data-cy='update-location-button']")
										.click({ force: true })
										.then(() => {
											// update name and last name
											cy.get("[data-cy='city-input']").clear().type('Nantes')
											cy.get("[data-cy='action-radius-input']")
												.clear()
												.type('5')

											cy.get("[data-cy='save-button-location']")
												.click()
												.then(() => {
													// wait for the update to finish
													cy.wait('@patchMeMakeup')
														.its('response.statusCode')
														.should('eq', 200)
												})
										})
								})
						})
				})
		})
	})

	/**
	 * open the modal
	 * check if the error is displayed when the user try to set an empty skill
	 * check if the error is displayed when the user try to set a skill with just a space
	 * check if the error is displayed when the user try to set a too long skill
	 * check if the update is ok
	 */
	describe('Skills - section - (min, max, required)', () => {
		it('tests complet Skills - section', () => {
			cy.visit('http://localhost:3000/auth/profil')

			cy.wait(250)

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

						cy.get("[data-cy='skills-input']").clear().type('{enter}')

						cy.get("[data-cy='error-skills']").should(
							'contain',
							'Une compétence est requise.'
						)

						cy.get("[data-cy='skills-input']").clear().type(' ;')

						cy.get("[data-cy='error-skills']").should(
							'contain',
							'Une compétence est requise.'
						)

						cy.get("[data-cy='save-button-skills']")
							.click()
							.then(() => {
								cy.get("[data-cy='update-skills-button']")
									.click({ force: true })
									.then(() => {
										cy.get("[data-cy='skills-input']")
											.clear()
											.type('a'.repeat(71))
											.type('{enter}')

										cy.get("[data-cy='error-skills']").should(
											'contain',
											'Les compétences ne doivent pas dépasser 70 caractères.'
										)

										cy.get("[data-cy='save-button-skills']")
											.click()
											.then(() => {
												cy.get("[data-cy='skills-input']")
													.clear()
													.type('pieds')
													.type('{enter}')

												cy.get("[data-cy='save-button-skills']")
													.click()
													.then(() => {
														cy.wait('@patchMeMakeup')
															.its('response.statusCode')
															.should('eq', 200)
													})
											})
									})
							})
					})
				})
		})
	})

	/**
	 * open the modal
	 * check if the error is displayed when the user try to set an empty diploma
	 * modify the diploma and update it
	 * check if the update is ok
	 */
	describe('Diplomas and Courses - section - (min, max, required)', () => {
		it('tests complet Diplomas and courses - section', () => {
			cy.visit('http://localhost:3000/auth/profil')

			cy.wait(250)

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

						cy.get("[data-cy='diploma-input']").clear()
						cy.get("[data-cy='school-input']").clear()
						cy.get("[data-cy='date-graduation-input']").clear()
						cy.get("[data-cy='course-description-input']").clear()

						cy.get("[data-cy='add-course-button']")
							.click()
							.then(() => {
								cy.get("[data-cy='error-diploma']").should(
									'contain',
									'Le nom du diplôme est requis.'
								)
								cy.get("[data-cy='error-school']").should(
									'contain',
									"Le nom de l'école est requis."
								)
								cy.get("[data-cy='error-date-graduation']").should(
									'contain',
									"La date d'obtention du diplôme est requise."
								)
								cy.get("[data-cy='error-course-description']").should(
									'contain',
									'La description est requise.'
								)

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
												// wait for the update to finish
												cy.wait('@patchMeMakeup')
													.its('response.statusCode')
													.should('eq', 200)

												cy.get("[data-cy='update-courses-button']")
													.click({ force: true })
													.then(() => {
														cy.get("[data-cy='course-edit-button-0']").click()
														cy.get("[data-cy='diploma-input']").should(
															'have.value',
															'Epsi'
														)
														cy.get("[data-cy='school-input']").should(
															'have.value',
															'epsi'
														)
														cy.get("[data-cy='date-graduation-input']").should(
															'have.value',
															'2022-12-15'
														)
														cy.get(
															"[data-cy='course-description-input']"
														).should('have.value', 'informatique')

														cy.get("[data-cy='diploma-input']")
															.clear()
															.type('EpsiModified')
														cy.get("[data-cy='school-input']")
															.clear()
															.type('epsiModified')
														cy.get("[data-cy='date-graduation-input']")
															.clear()
															.type('2022-12-16')
														cy.get("[data-cy='course-description-input']")
															.clear()
															.type('informatiqueModified')

														cy.get("[data-cy='add-course-button']")
															.click()
															.then(() => {
																cy.get("[data-cy='save-button-courses']")
																	.click()
																	.then(() => {
																		// wait for the update to finish
																		cy.wait('@patchMeMakeup')
																			.its('response.statusCode')
																			.should('eq', 200)
																	})
															})
													})
											})
									})
							})
					})
				})
		})
	})

	describe('Professional Experiences - section - (min, max, required)', () => {
		it('tests complet Professional experience - section', () => {
			cy.visit('http://localhost:3000/auth/profil')

			cy.wait(250)

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
						cy.get("[data-cy='company-input']").clear()
						cy.get("[data-cy='job-name-input']").clear()
						cy.get("[data-cy='city-input']").clear()
						cy.get("[data-cy='date-start-input']").clear()
						cy.get("[data-cy='date-end-input']").clear()
						cy.get("[data-cy='description-experience-input']").clear()

						cy.get("[data-cy='add-experience-button']")
							.click({
								force: true,
							})
							.then(() => {
								cy.get("[data-cy='error-company']").should(
									'contain',
									"Le nom de l'entreprise est requis."
								)
								cy.get("[data-cy='error-job-name']").should(
									'contain',
									"Le nom de l'expérience est requis"
								)
								cy.get("[data-cy='error-city']").should(
									'contain',
									'La ville est requise.'
								)
								cy.get("[data-cy='error-description-experience']").should(
									'contain',
									'La description est requise.'
								)

								cy.get("[data-cy='company-input']").clear().type('ForHives')
								cy.get("[data-cy='job-name-input']").clear().type('dev')
								cy.get("[data-cy='city-input']").clear().type('Nantes')
								cy.get("[data-cy='date-start-input']")
									.clear()
									.type('2021-05-01')
								cy.get("[data-cy='date-end-input']").clear().type('2021-05-01')
								cy.get("[data-cy='description-experience-input']")
									.clear()
									.type('informatique')

								cy.get("[data-cy='add-experience-button']")
									.click({
										force: true,
									})
									.then(() => {
										cy.get("[data-cy='save-button-experience']")
											.click()
											.then(() => {
												// wait for the update to finish
												cy.wait('@patchMeMakeup')
													.its('response.statusCode')
													.should('eq', 200)

												cy.wait(250)

												cy.get("[data-cy='update-experience-button']")
													.click()
													.then(() => {
														cy.get("[data-cy='experience-selected-0']")
															.click()
															.then(() => {
																cy.get("[data-cy='company-input']").should(
																	'have.value',
																	'ForHives'
																)
																cy.get("[data-cy='job-name-input']").should(
																	'have.value',
																	'dev'
																)
																cy.get("[data-cy='city-input']").should(
																	'have.value',
																	'Nantes'
																)
																cy.get("[data-cy='date-start-input']").should(
																	'have.value',
																	'2021-05-01'
																)
																cy.get("[data-cy='date-end-input']").should(
																	'have.value',
																	'2021-05-01'
																)
																cy.get(
																	"[data-cy='description-experience-input']"
																).should('have.value', 'informatique')

																cy.get("[data-cy='company-input']")
																	.clear()
																	.type('ForHivesModified')
																cy.get("[data-cy='job-name-input']")
																	.clear()
																	.type('devModified')
																cy.get("[data-cy='city-input']")
																	.clear()
																	.type('NantesModified')
																cy.get("[data-cy='date-start-input']")
																	.clear()
																	.type('2021-05-02')
																cy.get("[data-cy='date-end-input']")
																	.clear()
																	.type('2021-05-02')
																cy.get(
																	"[data-cy='description-experience-input']"
																)
																	.clear()
																	.type('informatiqueModified')

																cy.get("[data-cy='add-experience-button']")
																	.click()
																	.then(() => {
																		cy.get("[data-cy='save-button-experience']")
																			.click()
																			.then(() => {
																				cy.wait('@patchMeMakeup')
																					.its('response.statusCode')
																					.should('eq', 200)
																			})
																	})
															})
													})
											})
									})
							})
					})
				})
		})
	})

	describe('Languages - section - (min, max, required)', () => {
		it('tests complet Languages - section', () => {
			cy.visit('http://localhost:3000/auth/profil')

			cy.wait(250)

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
								// wait for the update to finish
								cy.wait('@patchMeMakeup')
									.its('response.statusCode')
									.should('eq', 200)
							})
					})
				})
		})
	})

	describe('Social Medias - section - (min, max, required)', () => {
		it('tests complet Social Medias - section', () => {
			cy.visit('http://localhost:3000/auth/profil')

			cy.wait(250)

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
							// wait for the update to finish
							cy.wait('@patchMeMakeup')
								.its('response.statusCode')
								.should('eq', 200)
						})
				})
		})
	})

	describe('Service Offers - section - (min, max, required)', () => {
		it('tests complet Service Offers - section', () => {
			cy.visit('http://localhost:3000/auth/profil')

			cy.wait(250)

			cy.get("[data-cy='update-service-offers-button']")
				.click({ force: true })
				.then(() => {
					cy.get('body').then($body => {
						if (
							$body.find("[data-cy='delete-service-offers-button']").length > 0
						) {
							cy.get("[data-cy='delete-service-offers-button']").each(
								($el, index, $list) => {
									cy.wrap($el).click()
								}
							)
						}

						cy.get("[data-cy='name-service-offers-input")
							.clear()
							.type('Maquillage')
						cy.get("[data-cy='description-service-offers-input")
							.clear()
							.type('Maquillage de soirée')
						cy.get("[data-cy='price-service-offers-input").clear().type('50€')
						// add first option
						cy.get("[data-cy='add-service-offers-option-button']")
							.click({ force: true })
							.then(() => {
								cy.get("[data-cy='name-service-offers-option-input-0")
									.clear()
									.type('Maquillage 1')
								cy.get("[data-cy='description-service-offers-option-input-0")
									.clear()
									.type('Maquillage de soirée 1')
								cy.get("[data-cy='price-service-offers-option-input-0")
									.clear()
									.type('50€ 1')

								// add second option
								cy.get("[data-cy='add-service-offers-option-button']")
									.click({ force: true })
									.then(() => {
										cy.get("[data-cy='name-service-offers-option-input-1")
											.clear()
											.type('Maquillage 2')
										cy.get(
											"[data-cy='description-service-offers-option-input-1"
										)
											.clear()
											.type('Maquillage de soirée 2')
										cy.get("[data-cy='price-service-offers-option-input-1")
											.clear()
											.type('50€ 2')
									})
								// add third option
								cy.get("[data-cy='add-service-offers-option-button']")
									.click({ force: true })
									.then(() => {
										cy.get("[data-cy='name-service-offers-option-input-2")
											.clear()
											.type('Maquillage 3')
										cy.get(
											"[data-cy='description-service-offers-option-input-2"
										)
											.clear()
											.type('Maquillage de soirée 3')
										cy.get("[data-cy='price-service-offers-option-input-2")
											.clear()
											.type('50€ 3')
									})

								cy.get("[data-cy='add-service-offers-button']")
									.click({ force: true })
									.then(() => {
										cy.get("[data-cy='save-button-service-offers']")
											.click({
												force: true,
											})
											.then(() => {
												// wait for the update to finish
												cy.wait('@patchMeMakeup')
													.its('response.statusCode')
													.should('eq', 200)
											})
									})
							})
					})
				})
		})
	})

	describe('Portefolio - section - (min, max, required)', () => {
		it('tests complet Portefolio - section', () => {
			// upload image
			cy.visit('http://localhost:3000/auth/profil')

			// prepare the file to upload
			cy.fixture('./assets/profil.png', { encoding: null }).as('profilPicture')

			// prepare to intercept the request
			cy.intercept('POST', 'https://api.my-makeup.fr/api/upload').as('upload')

			cy.wait(250)

			cy.get("[data-cy='update-portefolio-button']")
				.click({ force: true })
				.then(() => {
					cy.get("[data-cy='file-upload-portefolio']").selectFile(
						'@profilPicture',
						{
							force: true,
						}
					)
					cy.get("[data-cy='add-button-portefolio")
						.click({ force: true })
						.then(() => {
							cy.wait('@upload').its('response.statusCode').should('eq', 200)
							cy.get("[data-cy='save-button-portefolio']")
								.click()
								.then(() => {
									// wait for the update to finish
									cy.wait('@patchMeMakeup')
										.its('response.statusCode')
										.should('eq', 200)
								})
						})
				})
		})
	})

	describe('all tests at once, check pourcentage evolution - (min, max, required)', () => {
		// 	copy paste all the tests here to run them all at once
		it('tests complet Resume - section', () => {
			cy.request({
				method: 'POST',
				url: 'https://api.my-makeup.fr/api/auth/local',
				headers: {
					'Content-Type': 'application/json',
				},
				body: {
					identifier: 'test@forhive.fr',
					password: 'TESTtest@1',
				},
			}).then(response => {
				const jwtToken = response.body.jwt
				cy.request({
					method: 'PATCH',
					url: 'https://api.my-makeup.fr/api/me-makeup',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${jwtToken}`,
					},
					body: {
						last_name: 'TEST',
						first_name: 'test',
						speciality: '',
						city: null,
						action_radius: null,
						score: null,
						available: null,
						description: null,
						company_artist_name: null,
						skills: [],
						network: {
							youtube: null,
							facebook: null,
							instagram: null,
							website: null,
							linkedin: null,
							phone: null,
							email: null,
						},
						experiences: [],
						courses: [],
						service_offers: [],
						image_gallery: null,
						main_picture: null,
						language: [],
					},
				}).then(response => {
					// vous pouvez faire des assertions ici sur la réponse
					expect(response.status).to.eq(200)

					cy.wait(250)
					cy.visit('http://localhost:3000/auth/profil')

					cy.get("[data-cy='completion-pourcentage-profil']").contains('8%')
				})
			})

			cy.wait(250)

			// prepare the file to upload
			cy.fixture('./assets/profil.png', { encoding: null }).as('profilPicture')

			// prepare to intercept the request
			cy.intercept('POST', 'https://api.my-makeup.fr/api/upload').as('upload')

			// 	open the modal
			cy.get("[data-cy='update-resume-button']")
				.click({ force: true })
				.then(() => {
					//  update profil picture
					cy.get("[data-cy='file-main-upload']").selectFile('@profilPicture', {
						force: true,
					})

					//  update name and last name
					cy.get("[data-cy='first-name-input']").clear().type('Utilisateur')
					cy.get("[data-cy='last-name-input']").clear().type('DE TEST')

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
							// wait for the update to finish
							cy.wait('@patchMeMakeup')
								.its('response.statusCode')
								.should('eq', 200)

							cy.get("[data-cy='completion-pourcentage-profil']").contains(
								'31%'
							)
						})
				})

			cy.wait(250)

			cy.get("[data-cy='update-description-button']")
				.click({ force: true })
				.then(() => {
					const description =
						"Je suis une maquilleuse passionnée avec plus de 10 ans d'expérience..."
					cy.get("[data-cy='description-input']").clear().type(description)

					cy.get("[data-cy='save-button-description']")
						.click()
						.then(() => {
							// wait for the update to finish
							cy.wait('@patchMeMakeup')
								.its('response.statusCode')
								.should('eq', 200)

							cy.get("[data-cy='completion-pourcentage-profil']").contains(
								'38%'
							)
						})
				})

			cy.wait(250)

			cy.get("[data-cy='update-location-button']")
				.click({ force: true })
				.then(() => {
					// update name and last name
					cy.get("[data-cy='city-input']").clear().type('Nantes')
					cy.get("[data-cy='action-radius-input']").clear().type('5')

					cy.get("[data-cy='save-button-location']")
						.click()
						.then(() => {
							// wait for the update to finish
							cy.wait('@patchMeMakeup')
								.its('response.statusCode')
								.should('eq', 200)

							cy.get("[data-cy='completion-pourcentage-profil']").contains(
								'46%'
							)
						})
				})

			cy.wait(250)

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
								// wait for the update to finish
								cy.wait('@patchMeMakeup')
									.its('response.statusCode')
									.should('eq', 200)

								cy.get("[data-cy='completion-pourcentage-profil']").contains(
									'54%'
								)
							})
					})
				})

			cy.wait(250)

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
										// wait for the update to finish
										cy.wait('@patchMeMakeup')
											.its('response.statusCode')
											.should('eq', 200)

										cy.get(
											"[data-cy='completion-pourcentage-profil']"
										).contains('62%')
									})
							})
					})
				})

			cy.wait(250)

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
						cy.get("[data-cy='company-input']").clear().type('ForHives')
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
										// wait for the update to finish
										cy.wait('@patchMeMakeup')
											.its('response.statusCode')
											.should('eq', 200)

										cy.get(
											"[data-cy='completion-pourcentage-profil']"
										).contains('69%')
									})
							})
					})
				})

			cy.wait(250)

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
								// wait for the update to finish
								cy.wait('@patchMeMakeup')
									.its('response.statusCode')
									.should('eq', 200)

								cy.get("[data-cy='completion-pourcentage-profil']").contains(
									'77%'
								)
							})
					})
				})

			cy.wait(250)

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
							// wait for the update to finish
							cy.wait('@patchMeMakeup')
								.its('response.statusCode')
								.should('eq', 200)

							cy.get("[data-cy='completion-pourcentage-profil']").contains(
								'85%'
							)
						})
				})

			cy.wait(250)

			cy.get("[data-cy='update-service-offers-button']")
				.click({ force: true })
				.then(() => {
					cy.get('body').then($body => {
						if (
							$body.find("[data-cy='delete-service-offers-button']").length > 0
						) {
							cy.get("[data-cy='delete-service-offers-button']").each(
								($el, index, $list) => {
									cy.wrap($el).click()
								}
							)
						}

						cy.get("[data-cy='name-service-offers-input")
							.clear()
							.type('Maquillage')
						cy.get("[data-cy='description-service-offers-input")
							.clear()
							.type('Maquillage de soirée')
						cy.get("[data-cy='price-service-offers-input").clear().type('50€')
						// add first option
						cy.get("[data-cy='add-service-offers-option-button']")
							.click({ force: true })
							.then(() => {
								cy.get("[data-cy='name-service-offers-option-input-0")
									.clear()
									.type('Maquillage 1')
								cy.get("[data-cy='description-service-offers-option-input-0")
									.clear()
									.type('Maquillage de soirée 1')
								cy.get("[data-cy='price-service-offers-option-input-0")
									.clear()
									.type('50€ 1')
							})
						// add second option
						cy.get("[data-cy='add-service-offers-option-button']")
							.click({ force: true })
							.then(() => {
								cy.get("[data-cy='name-service-offers-option-input-1")
									.clear()
									.type('Maquillage 2')
								cy.get("[data-cy='description-service-offers-option-input-1")
									.clear()
									.type('Maquillage de soirée 2')
								cy.get("[data-cy='price-service-offers-option-input-1")
									.clear()
									.type('50€ 2')
							})
						// add third option
						cy.get("[data-cy='add-service-offers-option-button']")
							.click({ force: true })
							.then(() => {
								cy.get("[data-cy='name-service-offers-option-input-2")
									.clear()
									.type('Maquillage 3')
								cy.get("[data-cy='description-service-offers-option-input-2")
									.clear()
									.type('Maquillage de soirée 3')
								cy.get("[data-cy='price-service-offers-option-input-2")
									.clear()
									.type('50€ 3')
							})

						cy.get("[data-cy='add-service-offers-button']")
							.click({ force: true })
							.then(() => {
								cy.get("[data-cy='save-button-service-offers']")
									.click({
										force: true,
									})
									.then(() => {
										// wait for the update to finish
										cy.wait('@patchMeMakeup')
											.its('response.statusCode')
											.should('eq', 200)

										cy.get(
											"[data-cy='completion-pourcentage-profil']"
										).contains('92%')
									})
							})
					})
				})

			cy.wait(250)

			cy.fixture('./assets/profil.png', { encoding: null }).as('profilPicture')

			// prepare to intercept the request
			cy.intercept('POST', 'https://api.my-makeup.fr/api/upload').as('upload')

			cy.get("[data-cy='update-portefolio-button']")
				.click({ force: true })
				.then(() => {
					cy.get("[data-cy='file-upload-portefolio']").selectFile(
						'@profilPicture',
						{
							force: true,
						}
					)
					cy.wait(250)

					cy.get("[data-cy='add-button-portefolio")
						.click({ force: true })
						.then(() => {
							cy.wait('@upload').its('response.statusCode').should('eq', 200)
							cy.wait(250)

							cy.get("[data-cy='save-button-portefolio']")
								.click()
								.then(() => {
									// wait for the update to finish
									cy.wait('@patchMeMakeup')
										.its('response.statusCode')
										.should('eq', 200)
								})
						})
				})

			cy.wait(250)

			cy.get("[data-cy='completion-pourcentage-profil']").contains('100%')
		})
	})
})

let cookies = null;

describe('profil', () => {
	before(() => {
		cy.intercept('POST', '/api/auth/callback/credentials?').as('getCredentials');
		cy.intercept('PATCH', 'https://api.my-makeup.fr/api/me-makeup').as('patchMeMakeup');

		cy.visit('http://localhost:3000/auth/signin');
		cy.get('[data-cy=\'email-input\']').click();
		cy.get('[data-cy=\'email-input\']').type(Cypress.env('TEST_USER'));
		cy.get('[data-cy=\'password-input\']').type(Cypress.env('TEST_PW'));
		cy.get('[data-cy=\'email-signin\']').click();

		cy.wait('@getCredentials').its('response.statusCode').should('eq', 200);

		// Save cookies after login
		cy.getAllCookies().then(cookie => {
			cookies = cookie;
		});
	});

	beforeEach(() => {
		// If cookies exist, set them before each test
		if (cookies) {
			cookies.forEach(cookie => {
				cy.setCookie(cookie.name, cookie.value, {
					domain: cookie.domain, expiry: cookie.expiry, httpOnly: cookie.httpOnly, path: cookie.path, secure: cookie.secure, sameSite: cookie.sameSite,
				});
			});
		}
	});

	// afterEach(() => {
	// 	cy.get("[data-cy='button-logout']").click()
	// })

	// 10 tests ( 10 components )
	describe('Resume - section', () => {
		it('tests complet Resume - section', () => {
			cy.visit('http://localhost:3000/auth/profil').then(() => {
				// prepare the file to upload
				cy.fixture('./assets/profil.png', { encoding: null }).as('profilPicture');

				// prepare to intercept the request
				cy.intercept('POST', 'https://api.my-makeup.fr/api/upload').as('upload');

				// 	open the modal
				cy.get('[data-cy=\'update-resume-button\']')
					.click({ force: true })
					.then(() => {
						//  update profil picture
						cy.get('[data-cy=\'file-main-upload\']').selectFile('@profilPicture', {
							force: true,
						});

						//  update name and last name
						cy.get('[data-cy=\'first-name-input\']').clear().type('Utilisateur');
						cy.get('[data-cy=\'last-name-input\']').clear().type('DE TEST');

						//  update speciality
						cy.get('[data-cy=\'speciality-input\']')
							.clear()
							.type('Maquilleur professionnel et coiffeur professionnel pour le cinéma');

						//  update company-artist
						cy.get('[data-cy=\'company-artist-input\']')
							.clear()
							.type('My Makeup Artist');

						// switch availability to true
						// cy.get('[data-cy=\'available-input\']').click();   // todo : check the aivailability switch

						cy.get('[data-cy=\'save-button-resume\']')
							.click()
							.then(() => {
								// wait for the update to finish
								cy.wait('@patchMeMakeup')
									.its('response.statusCode')
									.should('eq', 200);
							});
					});
			});
		});
	});

	describe('Description - section', () => {
		it('tests complet Description - section', () => {
			cy.visit('http://localhost:3000/auth/profil').then(() => {
				cy.get('[data-cy=\'update-description-button\']')
					.click({ force: true })
					.then(() => {
						const description = 'Je suis une maquilleuse passionnée avec plus de 10 ans d\'expérience...';
						cy.get('[data-cy=\'description-input\']').clear().type(description);

						cy.get('[data-cy=\'save-button-description\']')
							.click()
							.then(() => {
								// wait for the update to finish
								cy.wait('@patchMeMakeup')
									.its('response.statusCode')
									.should('eq', 200);
							});
					});
			});
		});
	});

	describe('Location - section', () => {
		it('tests complet Location - section', () => {
			cy.visit('http://localhost:3000/auth/profil').then(() => {
				// 	open the modal
				cy.get('[data-cy=\'update-location-button\']')
					.click({ force: true })
					.then(() => {
						// update name and last name
						cy.get('[data-cy=\'city-input\']').clear().type('Nantes');
						cy.get('[data-cy=\'action-radius-input\']').clear().type('5');

						cy.get('[data-cy=\'save-button-location\']')
							.click()
							.then(() => {
								// wait for the update to finish
								cy.wait('@patchMeMakeup')
									.its('response.statusCode')
									.should('eq', 200);
							});
					});
			});
		});
	});

	describe('Skills - section', () => {
		it('tests complet Skills - section', () => {
			cy.visit('http://localhost:3000/auth/profil').then(() => {
				// open the modal
				cy.get('[data-cy=\'update-skills-button\']')
					.click({ force: true })
					.then(() => {
						cy.get('body').then($body => {
							if ($body.find('[data-cy=\'skill-selected\']').length > 0) {
								cy.get('[data-cy=\'skill-selected\']').each(($el, index, $list) => {
									cy.wrap($el).click();
								});
							}
							// update skills
							cy.get('[data-cy=\'skills-input\']')
								.clear()
								.type('pieds')
								.type('{enter}');

							cy.get('[data-cy=\'save-button-skills\']')
								.click()
								.then(() => {
									// wait for the update to finish
									cy.wait('@patchMeMakeup')
										.its('response.statusCode')
										.should('eq', 200);
								});
						});
					});
			});
		});
	});

	describe('Diplomas and Courses - section', () => {
		it('tests complet Diplomas and courses - section', () => {
			cy.visit('http://localhost:3000/auth/profil').then(() => {
				cy.get('[data-cy=\'update-courses-button\']')
					.click({ force: true })
					.then(() => {
						cy.get('body').then($body => {
							if ($body.find('[data-cy=\'course-delete-button\']').length > 0) {
								cy.get('[data-cy=\'course-delete-button\']').each(($el, index, $list) => {
									cy.wrap($el).click();
								});
							}
							cy.get('[data-cy=\'diploma-input\']').clear().type('Epsi');
							cy.get('[data-cy=\'school-input\']').clear().type('epsi');
							cy.get('[data-cy=\'date-graduation-input\']')
								.clear()
								.type('2022-12-15');
							cy.get('[data-cy=\'course-description-input\']')
								.clear()
								.type('informatique');

							cy.get('[data-cy=\'add-course-button\']')
								.click()
								.then(() => {
									cy.get('[data-cy=\'save-button-courses\']')
										.click()
										.then(() => {
											// wait for the update to finish
											cy.wait('@patchMeMakeup')
												.its('response.statusCode')
												.should('eq', 200);
										});
								});
						});
					});
			});
		});
	});

	describe('Professional Experiences - section', () => {
		it('tests complet Professional experience - section', () => {
			cy.visit('http://localhost:3000/auth/profil').then(() => {
				cy.get('[data-cy=\'update-experience-button\']')
					.click({ force: true })
					.then(() => {
						cy.get('body').then($body => {
							if ($body.find('[data-cy=\'experience-selected\']').length > 0) {
								cy.get('[data-cy=\'experience-selected\']').each(($el, index, $list) => {
									cy.wrap($el).click();
								});
							}

							// update experience
							cy.get('[data-cy=\'company-input\']').clear().type('ForHives');
							cy.get('[data-cy=\'job-name-input\']').clear().type('dev');
							cy.get('[data-cy=\'city-input\']').clear().type('Nantes');
							cy.get('[data-cy=\'date-start-input\']').clear().type('2021-05-01');
							cy.get('[data-cy=\'date-end-input\']').clear().type('2023-05-01');
							cy.get('[data-cy=\'description-experience-input\']')
								.clear()
								.type('Développement web');

							cy.get('[data-cy=\'add-experience-button\']')
								.click({
									force: true,
								})
								.then(() => {
									cy.get('[data-cy=\'save-button-experience\']')
										.click()
										.then(() => {
											// wait for the update to finish
											cy.wait('@patchMeMakeup')
												.its('response.statusCode')
												.should('eq', 200);
										});
								});
						});
					});
			});
		});
	});

	describe('Languages - section', () => {
		it('tests complet Languages - section', () => {
			cy.visit('http://localhost:3000/auth/profil').then(() => {
				cy.get('[data-cy=\'update-languages-button\']')
					.click({ force: true })
					.then(() => {
						cy.get('body').then($body => {
							if ($body.find('[data-cy=\'language-selected\']').length > 0) {
								cy.get('[data-cy=\'language-selected\']').each(($el, index, $list) => {
									cy.wrap($el).click();
								});
							}

							// update experience
							cy.get('[data-cy=\'language-input\']')
								.clear()
								.type('Anglais')
								.type('{enter}');

							cy.get('[data-cy=\'save-button-languages\']')
								.click({
									force: true,
								})
								.then(() => {
									// wait for the update to finish
									cy.wait('@patchMeMakeup')
										.its('response.statusCode')
										.should('eq', 200);
								});
						});
					});
			});
		});
	});

	describe('Social Medias - section', () => {
		it('tests complet Social Medias - section', () => {
			cy.visit('http://localhost:3000/auth/profil').then(() => {
				cy.get('[data-cy=\'update-social-medias-button\']')
					.click({ force: true })
					.then(() => {
						cy.get('[data-cy=\'email-input\']').clear().type('test@test.test');

						cy.get('[data-cy=\'facebook-input\']')
							.clear()
							.type('https://facebook.com');

						cy.get('[data-cy=\'instagram-input\']')
							.clear()
							.type('https://instagram.com');

						cy.get('[data-cy=\'linkedin-input\']')
							.clear()
							.type('https://linkedin.com');

						cy.get('[data-cy=\'phone-input\']').clear().type('0606060606');

						cy.get('[data-cy=\'website-input\']')
							.clear()
							.type('https://my-makeup.fr');

						cy.get('[data-cy=\'youtube-input\']')
							.clear()
							.type('https://youtube.com');

						cy.get('[data-cy=\'save-button-social-medias\']')
							.click({
								force: true,
							})
							.then(() => {
								// wait for the update to finish
								cy.wait('@patchMeMakeup')
									.its('response.statusCode')
									.should('eq', 200);
							});
					});
			});
		});
	});

	describe('Service Offers - section', () => {
		it('tests complet Service Offers - section', () => {
			cy.visit('http://localhost:3000/auth/profil').then(() => {
				cy.get('[data-cy=\'update-service-offers-button\']')
					.click({ force: true })
					.then(() => {
						cy.get('body').then($body => {
							if ($body.find('[data-cy=\'delete-service-offers-button\']').length > 0) {
								cy.get('[data-cy=\'delete-service-offers-button\']').each(($el, index, $list) => {
									cy.wrap($el).click();
								});
							}

							cy.get('[data-cy=\'name-service-offers-input')
								.clear()
								.type('Maquillage');
							cy.get('[data-cy=\'description-service-offers-input')
								.clear()
								.type('Maquillage de soirée');
							cy.get('[data-cy=\'price-service-offers-input').clear().type('50€');
							// add first option
							cy.get('[data-cy=\'add-service-offers-option-button\']')
								.click({ force: true })
								.then(() => {
									cy.get('[data-cy=\'name-service-offers-option-input-0')
										.clear()
										.type('Maquillage 1');
									cy.get('[data-cy=\'description-service-offers-option-input-0')
										.clear()
										.type('Maquillage de soirée 1');
									cy.get('[data-cy=\'price-service-offers-option-input-0')
										.clear()
										.type('50€ 1');
								});
							// add second option
							cy.get('[data-cy=\'add-service-offers-option-button\']')
								.click({ force: true })
								.then(() => {
									cy.get('[data-cy=\'name-service-offers-option-input-1')
										.clear()
										.type('Maquillage 2');
									cy.get('[data-cy=\'description-service-offers-option-input-1')
										.clear()
										.type('Maquillage de soirée 2');
									cy.get('[data-cy=\'price-service-offers-option-input-1')
										.clear()
										.type('50€ 2');
								});
							// add third option
							cy.get('[data-cy=\'add-service-offers-option-button\']')
								.click({ force: true })
								.then(() => {
									cy.get('[data-cy=\'name-service-offers-option-input-2')
										.clear()
										.type('Maquillage 3');
									cy.get('[data-cy=\'description-service-offers-option-input-2')
										.clear()
										.type('Maquillage de soirée 3');
									cy.get('[data-cy=\'price-service-offers-option-input-2')
										.clear()
										.type('50€ 3');
								});

							cy.get('[data-cy=\'add-service-offers-button\']')
								.click({ force: true })
								.then(() => {
									cy.get('[data-cy=\'save-button-service-offers\']')
										.click({
											force: true,
										})
										.then(() => {
											// wait for the update to finish
											cy.wait('@patchMeMakeup')
												.its('response.statusCode')
												.should('eq', 200);
										});
								});
						});
					});
			});
		});
	});

	describe('Portefolio - section', () => {
		it('tests complet Portefolio - section', () => {
			// upload image
			cy.visit('http://localhost:3000/auth/profil').then(() => {
				// prepare the file to upload
				cy.fixture('./assets/profil.png', { encoding: null }).as('profilPicture');

				// prepare to intercept the request
				cy.intercept('POST', 'https://api.my-makeup.fr/api/upload').as('upload');
				cy.get('[data-cy=\'update-portefolio-button\']')
					.click({ force: true })
					.then(() => {
						cy.get('[data-cy=\'file-upload-portefolio\']').selectFile('@profilPicture', {
							force: true,
						});
						cy.get('[data-cy=\'add-button-portefolio')
							.click({ force: true })
							.then(() => {
								cy.wait('@upload').its('response.statusCode').should('eq', 200);
								cy.get('[data-cy=\'save-button-portefolio\']')
									.click()
									.then(() => {
										// wait for the update to finish
										cy.wait('@patchMeMakeup')
											.its('response.statusCode')
											.should('eq', 200);
									});
							});
					});
			});
		});
	});

	describe('all tests at once, check pourcentage evolution', () => {
		// 	copy paste all the tests here to run them all at once
		it('tests complet Resume - section', () => {
			cy.request({
				method: 'POST', url: 'https://api.my-makeup.fr/api/auth/local', headers: {
					'Content-Type': 'application/json',
				}, body: {
					identifier: 'test@forhive.fr', password: 'TESTtest@1',
				},
			}).then(response => {
				const jwtToken = response.body.jwt;
				cy.request({
					method: 'PATCH', url: 'https://api.my-makeup.fr/api/me-makeup', headers: {
						'Content-Type': 'application/json', Authorization: `Bearer ${jwtToken}`,
					}, body: {
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
							youtube: null, facebook: null, instagram: null, website: null, linkedin: null, phone: null, email: null,
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
					expect(response.status).to.eq(200);

					cy.visit('http://localhost:3000/auth/profil').then(() => {
						cy.get('[data-cy=\'completion-pourcentage-profil\']').contains('8%');

						// prepare the file to upload
						cy.fixture('./assets/profil.png', { encoding: null }).as('profilPicture');

						// prepare to intercept the request
						cy.intercept('POST', 'https://api.my-makeup.fr/api/upload').as('upload');

						// 	open the modal
						cy.get('[data-cy=\'update-resume-button\']')
							.click({ force: true })
							.then(() => {
								//  update profil picture
								cy.get('[data-cy=\'file-main-upload\']').selectFile('@profilPicture', {
									force: true,
								});

								//  update name and last name
								cy.get('[data-cy=\'first-name-input\']')
									.clear()
									.type('Utilisateur');
								cy.get('[data-cy=\'last-name-input\']').clear().type('DE TEST');

								//  update speciality
								cy.get('[data-cy=\'speciality-input\']')
									.clear()
									.type('Maquilleur professionnel et coiffeur professionnel pour le cinéma');

								//  update company-artist
								cy.get('[data-cy=\'company-artist-input\']')
									.clear()
									.type('My Makeup Artist');

								// switch availability to true
								// cy.get('[data-cy=\'available-input\']').click();   // todo : check the aivailability switch

								cy.get('[data-cy=\'save-button-resume\']')
									.click()
									.then(() => {
										// wait for the update to finish
										cy.wait('@patchMeMakeup')
											.its('response.statusCode')
											.should('eq', 200);

										cy.get('[data-cy=\'completion-pourcentage-profil\']').contains('31%');

										cy.get('[data-cy=\'update-description-button\']')
											.click({ force: true })
											.then(() => {
												const description = 'Je suis une maquilleuse passionnée avec plus de 10 ans d\'expérience...';
												cy.get('[data-cy=\'description-input\']')
													.clear()
													.type(description);

												cy.get('[data-cy=\'save-button-description\']')
													.click()
													.then(() => {
														// wait for the update to finish
														cy.wait('@patchMeMakeup')
															.its('response.statusCode')
															.should('eq', 200);

														cy.get('[data-cy=\'completion-pourcentage-profil\']').contains('38%');

														cy.get('[data-cy=\'update-location-button\']')
															.click({ force: true })
															.then(() => {
																// update name and last name
																cy.get('[data-cy=\'city-input\']')
																	.clear()
																	.type('Nantes');
																cy.get('[data-cy=\'action-radius-input\']')
																	.clear()
																	.type('5');

																cy.get('[data-cy=\'save-button-location\']')
																	.click()
																	.then(() => {
																		// wait for the update to finish
																		cy.wait('@patchMeMakeup')
																			.its('response.statusCode')
																			.should('eq', 200);

																		cy.get('[data-cy=\'completion-pourcentage-profil\']').contains('46%');

																		cy.get('[data-cy=\'update-skills-button\']')
																			.click({ force: true })
																			.then(() => {
																				cy.get('body').then($body => {
																					if ($body.find('[data-cy=\'skill-selected\']').length > 0) {
																						cy.get('[data-cy=\'skill-selected\']').each(($el, index, $list) => {
																							cy.wrap($el).click();
																						});
																					}
																					// update skills
																					cy.get('[data-cy=\'skills-input\']')
																						.clear()
																						.type('pieds')
																						.type('{enter}');

																					cy.get('[data-cy=\'save-button-skills\']')
																						.click()
																						.then(() => {
																							// wait for the update to finish
																							cy.wait('@patchMeMakeup')
																								.its('response.statusCode')
																								.should('eq', 200);

																							cy.get('[data-cy=\'completion-pourcentage-profil\']').contains('54%');
																							cy.get('[data-cy=\'update-courses-button\']')
																								.click({ force: true })
																								.then(() => {
																									cy.get('body').then($body => {
																										if ($body.find('[data-cy=\'course-delete-button\']').length > 0) {
																											cy.get('[data-cy=\'course-delete-button\']').each(($el, index, $list) => {
																												cy.wrap($el).click();
																											});
																										}
																										cy.get('[data-cy=\'diploma-input\']')
																											.clear()
																											.type('Epsi');
																										cy.get('[data-cy=\'school-input\']')
																											.clear()
																											.type('epsi');
																										cy.get('[data-cy=\'date-graduation-input\']')
																											.clear()
																											.type('2022-12-15');
																										cy.get('[data-cy=\'course-description-input\']')
																											.clear()
																											.type('informatique');

																										cy.get('[data-cy=\'add-course-button\']')
																											.click()
																											.then(() => {
																												cy.get('[data-cy=\'save-button-courses\']')
																													.click()
																													.then(() => {
																														// wait for the update to finish
																														cy.wait('@patchMeMakeup')
																															.its('response.statusCode')
																															.should('eq', 200);

																														cy.get('[data-cy=\'completion-pourcentage-profil\']').contains('62%');

																														cy.get('[data-cy=\'update-experience-button\']')
																															.click({
																																force: true,
																															})
																															.then(() => {
																																cy.get('body').then($body => {
																																	if ($body.find('[data-cy=\'experience-selected\']').length > 0) {
																																		cy.get('[data-cy=\'experience-selected\']').each(($el, index, $list) => {
																																			cy.wrap($el).click();
																																		});
																																	}

																																	// update experience
																																	cy.get('[data-cy=\'company-input\']')
																																		.clear()
																																		.type('ForHives');
																																	cy.get('[data-cy=\'job-name-input\']')
																																		.clear()
																																		.type('dev');
																																	cy.get('[data-cy=\'city-input\']')
																																		.clear()
																																		.type('Nantes');
																																	cy.get('[data-cy=\'date-start-input\']')
																																		.clear()
																																		.type('2021-05-01');
																																	cy.get('[data-cy=\'date-end-input\']')
																																		.clear()
																																		.type('2023-05-01');
																																	cy.get('[data-cy=\'description-experience-input\']')
																																		.clear()
																																		.type('Développement web');

																																	cy.get('[data-cy=\'add-experience-button\']')
																																		.click({
																																			force: true,
																																		})
																																		.then(() => {
																																			cy.get('[data-cy=\'save-button-experience\']')
																																				.click()
																																				.then(() => {
																																					// wait for the update to finish
																																					cy.wait('@patchMeMakeup')
																																						.its('response.statusCode')
																																						.should('eq', 200);

																																					cy.get('[data-cy=\'completion-pourcentage-profil\']').contains('69%');

																																					cy.get('[data-cy=\'update-languages-button\']')
																																						.click({
																																							force: true,
																																						})
																																						.then(() => {
																																							cy.get('body').then($body => {
																																								if ($body.find('[data-cy=\'language-selected\']').length > 0) {
																																									cy.get('[data-cy=\'language-selected\']').each(($el, index, $list) => {
																																										cy.wrap($el).click();
																																									});
																																								}

																																								// update experience
																																								cy.get('[data-cy=\'language-input\']')
																																									.clear()
																																									.type('Anglais')
																																									.type('{enter}');

																																								cy.get('[data-cy=\'save-button-languages\']')
																																									.click({
																																										force: true,
																																									})
																																									.then(() => {
																																										// wait for the update to finish
																																										cy.wait('@patchMeMakeup')
																																											.its('response.statusCode')
																																											.should('eq', 200);

																																										cy.get('[data-cy=\'completion-pourcentage-profil\']').contains('77%');

																																										cy.get('[data-cy=\'update-social-medias-button\']')
																																											.click({
																																												force: true,
																																											})
																																											.then(() => {
																																												cy.get('[data-cy=\'email-input\']')
																																													.clear()
																																													.type('test@test.test');

																																												cy.get('[data-cy=\'facebook-input\']')
																																													.clear()
																																													.type('https://facebook.com');

																																												cy.get('[data-cy=\'instagram-input\']')
																																													.clear()
																																													.type('https://instagram.com');

																																												cy.get('[data-cy=\'linkedin-input\']')
																																													.clear()
																																													.type('https://linkedin.com');

																																												cy.get('[data-cy=\'phone-input\']')
																																													.clear()
																																													.type('0606060606');

																																												cy.get('[data-cy=\'website-input\']')
																																													.clear()
																																													.type('https://my-makeup.fr');

																																												cy.get('[data-cy=\'youtube-input\']')
																																													.clear()
																																													.type('https://youtube.com');

																																												cy.get('[data-cy=\'save-button-social-medias\']')
																																													.click({
																																														force: true,
																																													})
																																													.then(() => {
																																														// wait for the update to finish
																																														cy.wait('@patchMeMakeup')
																																															.its('response.statusCode')
																																															.should('eq', 200);

																																														cy.get('[data-cy=\'completion-pourcentage-profil\']').contains('85%');

																																														cy.get('[data-cy=\'update-service-offers-button\']')
																																															.click({
																																																force: true,
																																															})
																																															.then(() => {
																																																cy.get('body').then($body => {
																																																	if ($body.find('[data-cy=\'delete-service-offers-button\']').length > 0) {
																																																		cy.get('[data-cy=\'delete-service-offers-button\']').each(($el, index, $list) => {
																																																			cy.wrap($el).click();
																																																		});
																																																	}

																																																	cy.get('[data-cy=\'name-service-offers-input')
																																																		.clear()
																																																		.type('Maquillage');
																																																	cy.get('[data-cy=\'description-service-offers-input')
																																																		.clear()
																																																		.type('Maquillage de soirée');
																																																	cy.get('[data-cy=\'price-service-offers-input')
																																																		.clear()
																																																		.type('50€');
																																																	// add first option
																																																	cy.get('[data-cy=\'add-service-offers-option-button\']')
																																																		.click({
																																																			force: true,
																																																		})
																																																		.then(() => {
																																																			cy.get('[data-cy=\'name-service-offers-option-input-0')
																																																				.clear()
																																																				.type('Maquillage 1');
																																																			cy.get('[data-cy=\'description-service-offers-option-input-0')
																																																				.clear()
																																																				.type('Maquillage de soirée 1');
																																																			cy.get('[data-cy=\'price-service-offers-option-input-0')
																																																				.clear()
																																																				.type('50€ 1');
																																																		});
																																																	// add second option
																																																	cy.get('[data-cy=\'add-service-offers-option-button\']')
																																																		.click({
																																																			force: true,
																																																		})
																																																		.then(() => {
																																																			cy.get('[data-cy=\'name-service-offers-option-input-1')
																																																				.clear()
																																																				.type('Maquillage 2');
																																																			cy.get('[data-cy=\'description-service-offers-option-input-1')
																																																				.clear()
																																																				.type('Maquillage de soirée 2');
																																																			cy.get('[data-cy=\'price-service-offers-option-input-1')
																																																				.clear()
																																																				.type('50€ 2');
																																																		});
																																																	// add third option
																																																	cy.get('[data-cy=\'add-service-offers-option-button\']')
																																																		.click({
																																																			force: true,
																																																		})
																																																		.then(() => {
																																																			cy.get('[data-cy=\'name-service-offers-option-input-2')
																																																				.clear()
																																																				.type('Maquillage 3');
																																																			cy.get('[data-cy=\'description-service-offers-option-input-2')
																																																				.clear()
																																																				.type('Maquillage de soirée 3');
																																																			cy.get('[data-cy=\'price-service-offers-option-input-2')
																																																				.clear()
																																																				.type('50€ 3');
																																																		});

																																																	cy.get('[data-cy=\'add-service-offers-button\']')
																																																		.click({
																																																			force: true,
																																																		})
																																																		.then(() => {
																																																			cy.get('[data-cy=\'save-button-service-offers\']')
																																																				.click({
																																																					force: true,
																																																				})
																																																				.then(() => {
																																																					// wait for the update to finish
																																																					cy.wait('@patchMeMakeup')
																																																						.its('response.statusCode')
																																																						.should('eq', 200);

																																																					cy.get('[data-cy=\'completion-pourcentage-profil\']').contains('92%');

																																																					cy.fixture('./assets/profil.png', {
																																																						encoding: null,
																																																					}).as('profilPicture');

																																																					// prepare to intercept the request
																																																					cy.intercept('POST', 'https://api.my-makeup.fr/api/upload').as('upload');

																																																					cy.get('[data-cy=\'update-portefolio-button\']')
																																																						.click({
																																																							force: true,
																																																						})
																																																						.then(() => {
																																																							cy.get('[data-cy=\'file-upload-portefolio\']').selectFile('@profilPicture', {
																																																								force: true,
																																																							});
																																																							cy.wait(250);

																																																							cy.get('[data-cy=\'add-button-portefolio')
																																																								.click({
																																																									force: true,
																																																								})
																																																								.then(() => {
																																																									cy.wait('@upload')
																																																										.its('response.statusCode')
																																																										.should('eq', 200);
																																																									cy.wait(250);

																																																									cy.get('[data-cy=\'save-button-portefolio\']')
																																																										.click()
																																																										.then(() => {
																																																											// wait for the update to finish
																																																											cy.wait('@patchMeMakeup')
																																																												.its('response.statusCode')
																																																												.should('eq', 200);

																																																											cy.wait(250);
																																																											cy.get('[data-cy=\'completion-pourcentage-profil\']').contains('100%');
																																																										});
																																																								});
																																																						});
																																																				});
																																																		});
																																																});
																																															});
																																													});
																																											});
																																									});
																																							});
																																						});
																																				});
																																		});
																																});
																															});
																													});
																											});
																									});
																								});
																						});
																				});
																			});
																	});
															});
													});
											});
									});
							});
					});
				});
			});
		});
	});
});

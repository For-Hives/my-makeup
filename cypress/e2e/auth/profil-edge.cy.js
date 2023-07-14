let cookies = null;

describe('profil-edge', () => {
	before(() => {
		cy.intercept('POST', '/api/auth/callback/credentials?').as('getCredentials');

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
		cy.intercept('PATCH', 'https://api.my-makeup.fr/api/me-makeup').as('patchMeMakeup');

		// If cookies exist, set them before each test
		if (cookies) {
			cookies.forEach(cookie => {
				cy.setCookie(cookie.name, cookie.value, {
					domain: cookie.domain,
					expiry: cookie.expiry,
					httpOnly: cookie.httpOnly,
					path: cookie.path,
					secure: cookie.secure,
					sameSite: cookie.sameSite,
				});
			});
		}
	});

	// 10 tests ( 10 components )
	// max upload size : 5Mo
	describe('Resume - section (min, max, required)', () => {
		it('tests complet Resume - section', () => {
			cy.visit('http://localhost:3000/auth/profil').then(() => {
				cy.wait(1000);

				// prepare the file to upload (big image)
				cy.fixture('./assets/big_image.jpg', { encoding: null }).as('bigImage');

				// prepare the file to upload
				cy.fixture('./assets/profil.png', { encoding: null }).as('profilPicture');

				// prepare to intercept the request
				cy.intercept('POST', 'https://api.my-makeup.fr/api/upload').as('upload');

				cy.wait(1000);
				// 	open the modal
				cy.get('[data-cy=\'update-resume-button\']')
					.click({ force: true })
					.then(() => {
						//  update profil picture ( img too big )
						cy.get('[data-cy=\'file-main-upload\']').selectFile('@bigImage', {
							force: true,
						});

						cy.wait(1000);

						cy.get(`[id=toast-alert]`).should('contain', 'Le fichier est trop grand, veuillez télécharger un fichier de moins de 1.5 Mo.');

						//  update profil picture
						cy.get('[data-cy=\'file-main-upload\']').selectFile('@profilPicture', {
							force: true,
						});

						// part to clean the inputs
						//  update name and last name
						cy.get('[data-cy=\'first-name-input\']').clear();
						cy.get('[data-cy=\'last-name-input\']').clear();

						//  update speciality
						cy.get('[data-cy=\'speciality-input\']').clear();

						//  update company-artist
						cy.get('[data-cy=\'company-artist-input\']').clear();

						cy.get('[data-cy=\'save-button-resume\']')
							.click()
							.then(() => {
								cy.get('[data-cy=\'error-first-name\']').should('contain', 'Le prénom est requis');
								cy.get('[data-cy=\'error-last-name\']').should('contain', 'Le nom est requis');
							});

						cy.wait(500);

						// check if the max is ok too
						cy.get('[data-cy=\'first-name-input\']').clear().invoke('val', 'a'.repeat(70)).type('!').invoke('val').should('have.length', 71);
						cy.get('[data-cy=\'last-name-input\']').clear().invoke('val', 'a'.repeat(70)).type('!').invoke('val').should('have.length', 71);

						//  update speciality
						cy.get('[data-cy=\'speciality-input\']').clear().invoke('val', 'a'.repeat(70)).type('!').invoke('val').should('have.length', 71);

						//  update company-artist
						cy.get('[data-cy=\'company-artist-input\']').clear().invoke('val', 'a'.repeat(70)).type('!').invoke('val').should('have.length', 71);

						cy.get('[data-cy=\'save-button-resume\']')
							.click()
							.then(() => {
								cy.get('[data-cy=\'error-first-name\']').should('contain', 'Le prénom ne doit pas dépasser 70 caractères.');
								cy.get('[data-cy=\'error-last-name\']').should('contain', 'Le nom ne doit pas dépasser 70 caractères.');
								cy.get('[data-cy=\'error-speciality\']').should('contain', 'La spécialité ne doit pas dépasser 70 caractères.');
								cy.get('[data-cy=\'error-company-artist-name\']').should('contain', 'Le nom de l\'entreprise ne doit pas dépasser 70 caractères.');
							});

						// part to set the user
						//  update name and last name
						cy.get('[data-cy=\'first-name-input\']').clear().type('Utilisateur');
						cy.get('[data-cy=\'last-name-input\']').clear().type('DE TEST');

						//  update speciality
						cy.get('[data-cy=\'speciality-input\']').clear().type('Maquilleur professionnel et coiffeur professionnel pour le cinéma');

						//  update company-artist
						cy.get('[data-cy=\'company-artist-input\']').clear().type('My Makeup Artist');

						// switch availability to true
						// cy.get('[data-cy=\'available-input\']').click();   // todo : check the aivailability switch

						cy.get('[data-cy=\'save-button-resume\']')
							.click()
							.then(() => {
								// wait for the update to finish
								cy.wait('@patchMeMakeup').its('response.statusCode').should('eq', 200).then(() => {
									cy.wait(1000);

									cy.get('[data-cy=\'profil-public-view\']').click().then(() => {
										cy.wait(1000);

										// first and lastname check
										cy.get('[data-cy=\'resume-name\']').should('contain', 'Utilisateur DE TEST');
										// 	resume-speciality
										cy.get('[data-cy=\'resume-speciality\']').should('contain', 'Maquilleur professionnel et coiffeur professionnel pour le cinéma');
										// 	resume-company-artist-name
										cy.get('[data-cy=\'resume-company-artist-name\']').should('contain', 'My Makeup Artist');
									});
								});
							});
					});
			});
		});
	});

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
			cy.visit('http://localhost:3000/auth/profil').then(() => {
				cy.wait(1000);
				cy.get('[data-cy=\'update-description-button\']')
					.click({ force: true })
					.then(() => {
						const description = 'Je suis une maquilleuse passionnée avec plus de 10 ans d\'expérience...';

						cy.get('[data-cy=\'description-input\']').invoke('val', 'a'.repeat(2000)).type('!').invoke('val').should('have.length', 2001);

						cy.get('[data-cy=\'save-button-description\']')
							.click()
							.then(() => {
								cy.get('[data-cy=\'error-description\']').should('contain', 'La description ne doit pas dépasser 2000 caractères.');

								cy.get('[data-cy=\'description-input\']').clear();

								cy.get('[data-cy=\'save-button-description\']')
									.click()
									.then(() => {
										cy.wait('@patchMeMakeup').its('response.statusCode').should('eq', 200);

										cy.get('[data-cy=\'update-description-button\']')
											.click({ force: true })
											.then(() => {
												cy.get('[data-cy=\'description-input\']').clear().type(description);

												cy.get('[data-cy=\'save-button-description\']')
													.click()
													.then(() => {
														cy.wait('@patchMeMakeup').its('response.statusCode').should('eq', 200);

														cy.get('[data-cy=\'profil-public-view\']').click().then(() => {
															cy.wait(1000);

															//   description
															cy.get('[data-cy=\'description\']').should('contain', 'Je suis une maquilleuse passionnée avec plus de 10 ans d\'expérience...');
														});
													});
											});
									});
							});
					});
			});
		});
	});

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
			cy.visit('http://localhost:3000/auth/profil').then(() => {
				cy.wait(1000);
				cy.get('[data-cy=\'update-location-button\']')
					.click({ force: true })
					.then(() => {
						// update name and last name
						cy.get('[data-cy=\'city-input\']').clear().invoke('val', 'a'.repeat(70)).type('!').invoke('val').should('have.length', 71);
						cy.get('[data-cy=\'action-radius-input\']').clear().type('1'.repeat(11));

						cy.get('[data-cy=\'save-button-location\']')
							.click()
							.then(() => {
								cy.get('[data-cy=\'error-city\']').should('contain', 'La localisation ne doit pas dépasser 70 caractères.');
								cy.get('[data-cy=\'error-action-radius\']').should('contain', 'Le rayon d\'action ne doit pas dépasser 10 caractères.');

								// update name and last name
								cy.get('[data-cy=\'city-input\']').clear();
								cy.get('[data-cy=\'action-radius-input\']').clear();

								cy.get('[data-cy=\'save-button-location\']')
									.click()
									.then(() => {
										// wait for the update to finish
										cy.wait('@patchMeMakeup').its('response.statusCode').should('eq', 200);

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
														cy.wait('@patchMeMakeup').its('response.statusCode').should('eq', 200);

														cy.get('[data-cy=\'profil-public-view\']').click().then(() => {
															cy.wait(1000);

															//   resume-city-action-radius
															cy.get('[data-cy=\'resume-city-action-radius\']').should('contain', 'peut se déplacer à Nantes & dans un rayon de 5km');

															//   location-city-action-radius
															cy.get('[data-cy=\'location-city-action-radius\']').should('contain', 'Nantes & 5km autour');
														});
													});
											});
									});
							});
					});
			});
		});
	});

	/**
	 * open the modal
	 * check if the error is displayed when the user try to set an empty skill
	 * check if the error is displayed when the user try to set a skill with just a space
	 * check if the error is displayed when the user try to set a too long skill
	 * check if the update is ok
	 */
	describe('Skills - section - (min, max, required)', () => {
		it('tests complet Skills - section', () => {
			cy.visit('http://localhost:3000/auth/profil').then(() => {
				cy.wait(1000);
				// open the modal
				cy.get('[data-cy=\'update-skills-button\']')
					.click({ force: true })
					.then(() => {
						cy.get('body').then($body => {
							if ($body.find('[data-cy=\'skill-selected\']').length > 0) {
								cy.get('[data-cy=\'skill-selected\']').then($elems => {
									const skillsCount = $elems.length;

									for (let i = 0; i < skillsCount; i++) {
										cy.get('[data-cy=\'skill-selected\']').first().click();
									}
								});
							}

							cy.get('[data-cy=\'skills-input\']').clear().type('{enter}');

							cy.get('[data-cy=\'error-skills\']').should('contain', 'Une compétence est requise.');

							cy.get('[data-cy=\'skills-input\']').clear().type(' ;');

							cy.get('[data-cy=\'error-skills\']').should('contain', 'Une compétence est requise.');

							cy.get('[data-cy=\'save-button-skills\']')
								.click()
								.then(() => {
									cy.get('[data-cy=\'update-skills-button\']')
										.click({ force: true })
										.then(() => {
											cy.get('[data-cy=\'skills-input\']').clear().invoke('val', 'a'.repeat(70)).type('!').invoke('val').should('have.length', 71);

											cy.get('[data-cy=\'skills-input\']').type('{enter}');

											cy.get('[data-cy=\'error-skills\']').should('contain', 'Les compétences ne doivent pas dépasser 70 caractères.');

											cy.get('[data-cy=\'save-button-skills\']')
												.click()
												.then(() => {
													cy.get('[data-cy=\'skills-input\']').clear().type('pieds').type('{enter}');

													cy.get('[data-cy=\'save-button-skills\']')
														.click()
														.then(() => {
															cy.wait('@patchMeMakeup').its('response.statusCode').should('eq', 200);

															cy.get('[data-cy=\'profil-public-view\']').click().then(() => {
																cy.wait(1000);

																//	skills
																cy.get('[data-cy=\'skill\']').should('contain', 'pieds');
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

	/**
	 * open the modal
	 * check if the error is displayed when the user try to set an empty diploma
	 * modify the diploma and update it
	 * check if the update is ok
	 */
	describe('Diplomas and Courses - section - (min, max, required)', () => {
		it('tests complet Diplomas and courses - section', () => {
			cy.visit('http://localhost:3000/auth/profil').then(() => {
				cy.wait(1000);
				cy.get('[data-cy=\'update-courses-button\']')
					.click({ force: true })
					.then(() => {
						cy.get('body').then($body => {
							if ($body.find('[data-cy=\'course-delete-button\']').length > 0) {
								cy.get('[data-cy=\'course-delete-button\']').then($elems => {
									const deleteButtonsCount = $elems.length;

									for (let i = 0; i < deleteButtonsCount; i++) {
										cy.get('[data-cy=\'course-delete-button\']').first().click();
									}
								});
							}

							cy.get('[data-cy=\'diploma-input\']').clear();
							cy.get('[data-cy=\'school-input\']').clear();
							cy.get('[data-cy=\'date-graduation-input\']').clear();
							cy.get('[data-cy=\'course-description-input\']').clear();

							cy.get('[data-cy=\'add-course-button\']')
								.click()
								.then(() => {
									cy.get('[data-cy=\'error-diploma\']').should('contain', 'Le nom du diplôme est requis.');
									cy.get('[data-cy=\'error-school\']').should('contain', 'Le nom de l\'école est requis.');
									cy.get('[data-cy=\'error-date-graduation\']').should('contain', 'La date d\'obtention du diplôme est requise.');
									cy.get('[data-cy=\'error-course-description\']').should('contain', 'La description est requise.');

									cy.get('[data-cy=\'diploma-input\']').clear().type('Epsi');
									cy.get('[data-cy=\'school-input\']').clear().type('epsi');
									cy.get('[data-cy=\'date-graduation-input\']').clear().type('2022-10-10');
									cy.get('[data-cy=\'course-description-input\']').clear().type('informatique');

									cy.get('[data-cy=\'add-course-button\']')
										.click()
										.then(() => {
											cy.get('[data-cy=\'save-button-courses\']')
												.click()
												.then(() => {
													// wait for the update to finish
													cy.wait('@patchMeMakeup').its('response.statusCode').should('eq', 200);

													cy.wait(1000);

													cy.get('[data-cy=\'update-courses-button\']')
														.click({ force: true })
														.then(() => {
															cy.wait(1000);

															cy.get('[data-cy=\'course-edit-button-0\']').click();
															cy.get('[data-cy=\'diploma-input\']').should('have.value', 'Epsi');
															cy.get('[data-cy=\'school-input\']').should('have.value', 'epsi');
															cy.get('[data-cy=\'date-graduation-input\']').should('have.value', '2022-10-10');
															cy.get('[data-cy=\'course-description-input\']').should('have.value', 'informatique');

															cy.get('[data-cy=\'diploma-input\']').clear().type('EpsiModified');
															cy.get('[data-cy=\'school-input\']').clear().type('epsiModified');
															cy.get('[data-cy=\'date-graduation-input\']').clear().type('2022-10-10');
															cy.get('[data-cy=\'course-description-input\']').clear().type('informatiqueModified');

															cy.get('[data-cy=\'add-course-button\']')
																.click()
																.then(() => {
																	cy.get('[data-cy=\'save-button-courses\']')
																		.click()
																		.then(() => {
																			// wait for the update to finish
																			cy.wait('@patchMeMakeup').its('response.statusCode').should('eq', 200);

																			cy.wait(1000);

																			cy.get('[data-cy=\'profil-public-view\']').click().then(() => {
																				cy.wait(1000);
																				// courses
																				cy.get('[data-cy=\'course-diploma\']').should('contain', 'EpsiModified');
																				cy.get('[data-cy=\'course-school\']').should('contain', 'epsiModified');
																				cy.get('[data-cy=\'course-date-graduation\']').should('contain', '2022-10-10');
																				cy.get('[data-cy=\'course-description\']').should('contain', 'informatiqueModified');
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

	describe('Professional Experiences - section - (min, max, required)', () => {
		it('tests complet Professional experience - section', () => {
			cy.visit('http://localhost:3000/auth/profil').then(() => {
				cy.wait(1000);
				cy.get('[data-cy=\'update-experience-button\']')
					.click({ force: true })
					.then(() => {
						cy.get('body').then($body => {
							if ($body.find('[data-cy=\'experience-selected\']').length > 0) {
								cy.get('[data-cy=\'experience-selected\']').then($elems => {
									const experienceCount = $elems.length;

									for (let i = 0; i < experienceCount; i++) {
										cy.get('[data-cy=\'experience-selected\']').first().click();
									}
								});
							}

							// update experience
							cy.get('[data-cy=\'company-input\']').clear();
							cy.get('[data-cy=\'job-name-input\']').clear();
							cy.get('[data-cy=\'city-input\']').clear();
							cy.get('[data-cy=\'date-start-input\']').clear();
							cy.get('[data-cy=\'date-end-input\']').clear();
							cy.get('[data-cy=\'description-experience-input\']').clear();

							cy.get('[data-cy=\'add-experience-button\']')
								.click({
									force: true,
								})
								.then(() => {
									cy.get('[data-cy=\'error-company\']').should('contain', 'Le nom de l\'entreprise est requis.');
									cy.get('[data-cy=\'error-job-name\']').should('contain', 'Le nom de l\'expérience est requis');
									cy.get('[data-cy=\'error-city\']').should('contain', 'La ville est requise.');
									cy.get('[data-cy=\'error-description-experience\']').should('contain', 'La description est requise.');

									cy.get('[data-cy=\'company-input\']').clear().type('ForHives');
									cy.get('[data-cy=\'job-name-input\']').clear().type('dev');
									cy.get('[data-cy=\'city-input\']').clear().type('Nantes');
									cy.get('[data-cy=\'date-start-input\']').clear().type('2021-05-05');
									cy.get('[data-cy=\'date-end-input\']').clear().type('2021-05-05');
									cy.get('[data-cy=\'description-experience-input\']').clear().type('informatique');

									cy.get('[data-cy=\'add-experience-button\']')
										.click({
											force: true,
										})
										.then(() => {
											cy.get('[data-cy=\'save-button-experience\']')
												.click()
												.then(() => {
													// wait for the update to finish
													cy.wait('@patchMeMakeup').its('response.statusCode').should('eq', 200);

													cy.wait(1000);

													cy.get('[data-cy=\'update-experience-button\']')
														.click({ force: true })
														.then(() => {
															cy.get('[data-cy=\'experience-selected-0\']')
																.click()
																.then(() => {
																	cy.get('[data-cy=\'company-input\']').should('have.value', 'ForHives');
																	cy.get('[data-cy=\'job-name-input\']').should('have.value', 'dev');
																	cy.get('[data-cy=\'city-input\']').should('have.value', 'Nantes');
																	cy.get('[data-cy=\'date-start-input\']').should('have.value', '2021-05-05');
																	cy.get('[data-cy=\'date-end-input\']').should('have.value', '2021-05-05');
																	cy.get('[data-cy=\'description-experience-input\']').should('have.value', 'informatique');

																	cy.get('[data-cy=\'company-input\']').clear().type('ForHivesModified');
																	cy.get('[data-cy=\'job-name-input\']').clear().type('devModified');
																	cy.get('[data-cy=\'city-input\']').clear().type('NantesModified');
																	cy.get('[data-cy=\'date-start-input\']').clear().type('2021-05-05');
																	cy.get('[data-cy=\'date-end-input\']').clear().type('2023-05-05');
																	cy.get('[data-cy=\'description-experience-input\']').clear().type('informatiqueModified');

																	cy.get('[data-cy=\'add-experience-button\']')
																		.click()
																		.then(() => {
																			cy.get('[data-cy=\'save-button-experience\']')
																				.click()
																				.then(() => {
																					cy.wait('@patchMeMakeup').its('response.statusCode').should('eq', 200);

																					cy.get('[data-cy=\'profil-public-view\']').click().then(() => {
																						cy.wait(1000);

																						// experiences
																						cy.get('[data-cy=\'experience-company\']').should('contain', 'ForHivesModified');
																						cy.get('[data-cy=\'experience-job-name\']').should('contain', 'devModified');
																						cy.get('[data-cy=\'experience-city\']').should('contain', 'NantesModified');
																						cy.get('[data-cy=\'experience-date\']').should('contain', 'mai 2021 - mai 2023');
																						cy.get('[data-cy=\'experience-description\']').should('contain', 'informatiqueModified');
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

	describe('Languages - section - (min, max, required)', () => {
		it('tests complet Languages - section', () => {
			cy.visit('http://localhost:3000/auth/profil').then(() => {
				cy.wait(1000);
				cy.get('[data-cy=\'update-languages-button\']')
					.click({ force: true })
					.then(() => {
						cy.get('body').then($body => {
							if ($body.find('[data-cy=\'language-selected\']').length > 0) {
								cy.get('[data-cy=\'language-selected\']').then($elems => {
									const languageCount = $elems.length;

									for (let i = 0; i < languageCount; i++) {
										cy.get('[data-cy=\'language-selected\']').first().click();
									}
								});
							}

							cy.get('[data-cy=\'language-input\']').clear().type('{enter}');

							cy.get('[data-cy=\'error-language\']').should('contain', 'La langue est requise.');

							cy.get('[data-cy=\'language-input\']').clear().type(' ;');

							cy.get('[data-cy=\'error-language\']').should('contain', 'La langue est requise.');

							cy.get('[data-cy=\'language-input\']').clear().invoke('val', 'a'.repeat(70)).type('!').invoke('val').should('have.length', 71);

							cy.get('[data-cy=\'language-input\']').type('{enter}');

							cy.get('[data-cy=\'error-language\']').should('contain', 'La langue ne doit pas dépasser 70 caractères.');

							cy.get('[data-cy=\'language-input\']').clear().invoke('val', 'a'.repeat(70)).type('!').invoke('val').should('have.length', 71);

							cy.get('[data-cy=\'language-input\']').type(';');

							cy.get('[data-cy=\'error-language\']').should('contain', 'La langue ne doit pas dépasser 70 caractères.');

							// update experience
							cy.get('[data-cy=\'language-input\']').clear().type('Anglais').type('{enter}');

							cy.get('[data-cy=\'save-button-languages\']')
								.click({
									force: true,
								})
								.then(() => {
									// wait for the update to finish
									cy.wait('@patchMeMakeup').its('response.statusCode').should('eq', 200);

									cy.get('[data-cy=\'profil-public-view\']').click().then(() => {
										cy.wait(1000);

										// 	Languages
										cy.get('[data-cy=\'language\']').should('contain', 'Anglais');
									});
								});
						});
					});
			});
		});
	});

	describe('Social Medias - section - (min, max, required)', () => {
		it('tests complet Social Medias - section', () => {
			cy.visit('http://localhost:3000/auth/profil').then(() => {
				cy.wait(1000);
				cy.get('[data-cy=\'update-social-medias-button\']')
					.click({ force: true })
					.then(() => {
						cy.get('[data-cy=\'email-input\']').clear();
						cy.get('[data-cy=\'facebook-input\']').clear();
						cy.get('[data-cy=\'instagram-input\']').clear();
						cy.get('[data-cy=\'linkedin-input\']').clear();
						cy.get('[data-cy=\'phone-input\']').clear();
						cy.get('[data-cy=\'website-input\']').clear();
						cy.get('[data-cy=\'youtube-input\']').clear();

						cy.get('[data-cy=\'save-button-social-medias\']')
							.click({
								force: true,
							})
							.then(() => {
								// wait for the update to finish
								cy.wait('@patchMeMakeup').its('response.statusCode').should('eq', 200);

								cy.get('[data-cy=\'update-social-medias-button\']')
									.click({ force: true })
									.then(() => {
										cy.get('[data-cy=\'email-input\']').clear().type('0');
										cy.get('[data-cy=\'facebook-input\']').clear().type('0');
										cy.get('[data-cy=\'instagram-input\']').clear().type('0');
										cy.get('[data-cy=\'linkedin-input\']').clear().type('0');
										cy.get('[data-cy=\'phone-input\']').clear().type('0');
										cy.get('[data-cy=\'website-input\']').clear().type('0');
										cy.get('[data-cy=\'youtube-input\']').clear().type('0');

										cy.get('[data-cy=\'save-button-social-medias\']')
											.click()
											.then(() => {
												cy.get('[data-cy=\'error-email\']').should('contain', 'Veuillez entrer un email valide.');
												cy.get('[data-cy=\'error-facebook\']').should('contain', 'Veuillez entrer une URL valide (https://...).');
												cy.get('[data-cy=\'error-instagram\']').should('contain', 'Veuillez entrer une URL valide (https://...).');
												cy.get('[data-cy=\'error-linkedin\']').should('contain', 'Veuillez entrer une URL valide (https://...).');
												cy.get('[data-cy=\'error-phone\']').should('contain', 'Le numéro de téléphone est requis.');
												cy.get('[data-cy=\'error-website\']').should('contain', 'Veuillez entrer une URL valide (https://...).');
												cy.get('[data-cy=\'error-youtube\']').should('contain', 'Veuillez entrer une URL valide (https://...).');

												cy.get('[data-cy=\'email-input\']').clear().invoke('val', 'a'.repeat(200)).type('@a.fr').invoke('val').should('have.length', 205);
												cy.get('[data-cy=\'facebook-input\']')
													.clear()
													.invoke('val', 'https://' + 'a'.repeat(200))
													.type('.fr')
													.invoke('val')
													.should('have.length', 211);
												cy.get('[data-cy=\'instagram-input\']')
													.clear()
													.invoke('val', 'https://' + 'a'.repeat(200))
													.type('.fr')
													.invoke('val')
													.should('have.length', 211);
												cy.get('[data-cy=\'linkedin-input\']')
													.clear()
													.invoke('val', 'https://' + 'a'.repeat(200))
													.type('.fr')
													.invoke('val')
													.should('have.length', 211);
												cy.get('[data-cy=\'phone-input\']').clear().invoke('val', '06'.repeat(10)).type('0').invoke('val').should('have.length', 21);
												cy.get('[data-cy=\'website-input\']')
													.clear()
													.invoke('val', 'https://' + 'a'.repeat(200))
													.type('.fr')
													.invoke('val')
													.should('have.length', 211);
												cy.get('[data-cy=\'youtube-input\']')
													.clear()
													.invoke('val', 'https://' + 'a'.repeat(200))
													.type('.fr')
													.invoke('val')
													.should('have.length', 211);

												cy.get('[data-cy=\'save-button-social-medias\']')
													.click()
													.then(() => {
														cy.get('[data-cy=\'error-email\']').should('contain', 'L\'email ne doit pas dépasser 200 caractères.');
														cy.get('[data-cy=\'error-facebook\']').should('contain', 'L\'URL ne doit pas dépasser 200 caractères.');
														cy.get('[data-cy=\'error-instagram\']').should('contain', 'L\'URL ne doit pas dépasser 200 caractères.');
														cy.get('[data-cy=\'error-linkedin\']').should('contain', 'L\'URL ne doit pas dépasser 200 caractères.');
														cy.get('[data-cy=\'error-phone\']').should('contain', 'Le numéro de téléphone ne doit pas dépasser 20 caractères.');
														cy.get('[data-cy=\'error-website\']').should('contain', 'L\'URL ne doit pas dépasser 200 caractères.');
														cy.get('[data-cy=\'error-youtube\']').should('contain', 'L\'URL ne doit pas dépasser 200 caractères.');

														cy.get('[data-cy=\'email-input\']').clear().type('test@forhives.fr');
														cy.get('[data-cy=\'facebook-input\']').clear().type('https://facebook.com');
														cy.get('[data-cy=\'instagram-input\']').clear().type('https://instagram.com');
														cy.get('[data-cy=\'linkedin-input\']').clear().type('https://linkedin.com');
														cy.get('[data-cy=\'phone-input\']').clear().type('0606060606');
														cy.get('[data-cy=\'website-input\']').clear().type('https://my-makeup.fr');
														cy.get('[data-cy=\'youtube-input\']').clear().type('https://youtube.com');
														cy.get('[data-cy=\'save-button-social-medias\']')
															.click({
																force: true,
															})
															.then(() => {
																// wait for the update to finish
																cy.wait('@patchMeMakeup').its('response.statusCode').should('eq', 200);

																cy.get('[data-cy=\'profil-public-view\']').click().then(() => {
																	cy.wait(1000);

																	//   social media
																	cy.get('[data-cy=\'email\']').should('contain', 'test@forhives.fr');
																	cy.get('[data-cy=\'facebook\']').should('contain', 'https://facebook.com');
																	cy.get('[data-cy=\'instagram\']').should('contain', 'https://instagram.com');
																	cy.get('[data-cy=\'linkedin\']').should('contain', 'https://linkedin.com');
																	cy.get('[data-cy=\'phone\']').should('contain', '0606060606');
																	cy.get('[data-cy=\'website\']').should('contain', 'https://my-makeup.fr');
																	cy.get('[data-cy=\'youtube\']').should('contain', 'https://youtube.com');
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

	describe('Service Offers - section - (min, max, required)', () => {
		it('tests complet Service Offers - section', () => {
			cy.visit('http://localhost:3000/auth/profil').then(() => {
				cy.wait(1000);
				cy.get('[data-cy=\'update-service-offers-button\']')
					.click({ force: true })
					.then(() => {
						cy.get('body').then($body => {
							if ($body.find('[data-cy=\'delete-service-offers-button\']').length > 0) {
								cy.get('[data-cy=\'delete-service-offers-button\']').then($elems => {
									const deleteButtonsCount = $elems.length;

									for (let i = 0; i < deleteButtonsCount; i++) {
										cy.get('[data-cy=\'delete-service-offers-button\']').first().click();
									}
								});
							}

							cy.get('[data-cy=\'name-service-offers-input\']').clear();
							cy.get('[data-cy=\'description-service-offers-input\']').clear();
							cy.get('[data-cy=\'price-service-offers-input\']').clear();
							// add first option
							cy.get('[data-cy=\'add-service-offers-option-button\']')
								.click({ force: true })
								.then(() => {
									cy.get('[data-cy=\'name-service-offers-option-input-0\']').clear();
									cy.get('[data-cy=\'description-service-offers-option-input-0\']').clear();
									cy.get('[data-cy=\'price-service-offers-option-input-0\']').clear();

									// add second option
									cy.get('[data-cy=\'add-service-offers-option-button\']')
										.click({ force: true })
										.then(() => {
											cy.get('[data-cy=\'name-service-offers-option-input-1\']').clear();
											cy.get('[data-cy=\'description-service-offers-option-input-1\']').clear();
											cy.get('[data-cy=\'price-service-offers-option-input-1\']').clear();
										});
									// add third option
									cy.get('[data-cy=\'add-service-offers-option-button\']')
										.click({ force: true })
										.then(() => {
											cy.get('[data-cy=\'name-service-offers-option-input-2\']').clear();
											cy.get('[data-cy=\'description-service-offers-option-input-2\']').clear();
											cy.get('[data-cy=\'price-service-offers-option-input-2\']').clear();
										});

									cy.get('[data-cy=\'add-service-offers-button\']')
										.click({
											force: true,
										})
										.then(() => {
											// ** check errors **
											cy.get('[data-cy=\'error-name\']').should('contain', 'Le nom du service est requis.');
											cy.get('[data-cy=\'error-price\']').should('contain', 'Le prix du service est requis.');
											cy.get('[data-cy=\'error-description\']').should('contain', 'La description du service est requise.');

											cy.get('[data-cy=\'error-name-0\']').should('contain', 'Le nom du service est requis.');
											cy.get('[data-cy=\'error-price-0\']').should('contain', 'Le prix du service est requis.');
											cy.get('[data-cy=\'error-description-0\']').should('contain', 'La description du service est requise.');

											cy.get('[data-cy=\'error-name-1\']').should('contain', 'Le nom du service est requis.');
											cy.get('[data-cy=\'error-price-1\']').should('contain', 'Le prix du service est requis.');
											cy.get('[data-cy=\'error-description-1\']').should('contain', 'La description du service est requise.');

											cy.get('[data-cy=\'error-name-2\']').should('contain', 'Le nom du service est requis.');
											cy.get('[data-cy=\'error-price-2\']').should('contain', 'Le prix du service est requis.');
											cy.get('[data-cy=\'error-description-2\']').should('contain', 'La description du service est requise.');

											// ** fill inputs with too longs values **
											cy.get('[data-cy=\'name-service-offers-input\']').clear().invoke('val', 'a'.repeat(70)).type('!').invoke('val').should('have.length', 71);
											cy.get('[data-cy=\'description-service-offers-input\']').clear().invoke('val', 'a'.repeat(2000)).type('!').invoke('val').should('have.length', 2001);

											cy.get('[data-cy=\'price-service-offers-input\']').clear().invoke('val', 'a'.repeat(70)).type('!').invoke('val').should('have.length', 71);

											cy.get('[data-cy=\'name-service-offers-option-input-0\']').clear().invoke('val', 'a'.repeat(70)).type('!').invoke('val').should('have.length', 71);

											cy.get('[data-cy=\'description-service-offers-option-input-0\']').clear().invoke('val', 'a'.repeat(2000)).type('!').invoke('val').should('have.length', 2001);
											cy.get('[data-cy=\'price-service-offers-option-input-0\']').clear().invoke('val', 'a'.repeat(70)).type('!').invoke('val').should('have.length', 71);

											cy.get('[data-cy=\'name-service-offers-option-input-1\']').clear().invoke('val', 'a'.repeat(70)).type('!').invoke('val').should('have.length', 71);
											cy.get('[data-cy=\'description-service-offers-option-input-1\']').clear().invoke('val', 'a'.repeat(2000)).type('!').invoke('val').should('have.length', 2001);

											cy.get('[data-cy=\'price-service-offers-option-input-1\']').clear().invoke('val', 'a'.repeat(70)).type('!').invoke('val').should('have.length', 71);

											cy.get('[data-cy=\'name-service-offers-option-input-2\']').clear().invoke('val', 'a'.repeat(70)).type('!').invoke('val').should('have.length', 71);
											cy.get('[data-cy=\'description-service-offers-option-input-2\']').clear().invoke('val', 'a'.repeat(2000)).type('!').invoke('val').should('have.length', 2001);

											cy.get('[data-cy=\'price-service-offers-option-input-2\']').clear().invoke('val', 'a'.repeat(70)).type('!').invoke('val').should('have.length', 71);

											// save & add the service
											cy.get('[data-cy=\'add-service-offers-button\']')
												.click({
													force: true,
												})
												.then(() => {
													// ** check errors **
													cy.get('[data-cy=\'error-name\']').should('contain', 'Le nom du service ne doit pas dépasser 70 caractères.');
													cy.get('[data-cy=\'error-price\']').should('contain', 'Le prix du service ne doit pas dépasser 70 caractères.');
													cy.get('[data-cy=\'error-description\']').should('contain', 'La description ne doit pas dépasser 2000 caractères.');

													cy.get('[data-cy=\'error-name-0\']').should('contain', 'Le nom du service ne doit pas dépasser 70 caractères.');
													cy.get('[data-cy=\'error-price-0\']').should('contain', 'Le prix du service ne doit pas dépasser 70 caractères.');
													cy.get('[data-cy=\'error-description-0\']').should('contain', 'La description ne doit pas dépasser 2000 caractères.');

													cy.get('[data-cy=\'error-name-1\']').should('contain', 'Le nom du service ne doit pas dépasser 70 caractères.');
													cy.get('[data-cy=\'error-price-1\']').should('contain', 'Le prix du service ne doit pas dépasser 70 caractères.');
													cy.get('[data-cy=\'error-description-1\']').should('contain', 'La description ne doit pas dépasser 2000 caractères.');

													cy.get('[data-cy=\'error-name-2\']').should('contain', 'Le nom du service ne doit pas dépasser 70 caractères.');
													cy.get('[data-cy=\'error-price-2\']').should('contain', 'Le prix du service ne doit pas dépasser 70 caractères.');
													cy.get('[data-cy=\'error-description-2\']').should('contain', 'La description ne doit pas dépasser 2000 caractères.');

													// ** fill inputs & add in normal way **
													cy.get('[data-cy=\'name-service-offers-input\']').clear().type('Maquillage');
													cy.get('[data-cy=\'description-service-offers-input\']').clear().type('Maquillage de soirée');
													cy.get('[data-cy=\'price-service-offers-input\']').clear().type('50€');

													cy.get('[data-cy=\'name-service-offers-option-input-0\']').clear().type('Maquillage 1');
													cy.get('[data-cy=\'description-service-offers-option-input-0\']').clear().type('Maquillage de soirée 1');
													cy.get('[data-cy=\'price-service-offers-option-input-0\']').clear().type('50€ 1');

													cy.get('[data-cy=\'name-service-offers-option-input-1\']').clear().type('Maquillage 2');
													cy.get('[data-cy=\'description-service-offers-option-input-1\']').clear().type('Maquillage de soirée 2');
													cy.get('[data-cy=\'price-service-offers-option-input-1\']').clear().type('50€ 2');

													cy.get('[data-cy=\'name-service-offers-option-input-2\']').clear().type('Maquillage 3');
													cy.get('[data-cy=\'description-service-offers-option-input-2\']').clear().type('Maquillage de soirée 3');
													cy.get('[data-cy=\'price-service-offers-option-input-2\']').clear().type('50€ 3');

													// save & add the service
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
																	cy.wait('@patchMeMakeup').its('response.statusCode').should('eq', 200);

																	cy.wait(1000);

																	// 	open the modal, and modify the service
																	cy.get('[data-cy=\'update-service-offers-button\']')
																		.click({ force: true })
																		.then(() => {
																			// click on offers edit button
																			cy.get('[data-cy=\'edit-service-offers-button-0\']')
																				.click({ force: true })
																				.then(() => {
																					// 		** check if the inputs are filled **
																					cy.get('[data-cy=\'name-service-offers-input\']').should('have.value', 'Maquillage');
																					cy.get('[data-cy=\'description-service-offers-input\']').should('have.value', 'Maquillage de soirée');
																					cy.get('[data-cy=\'price-service-offers-input\']').should('have.value', '50€');

																					// 		** check if the options are filled **
																					cy.get('[data-cy=\'name-service-offers-option-input-0\']').should('have.value', 'Maquillage 1');
																					cy.get('[data-cy=\'description-service-offers-option-input-0\']').should('have.value', 'Maquillage de soirée 1');
																					cy.get('[data-cy=\'price-service-offers-option-input-0\']').should('have.value', '50€ 1');
																					cy.get('[data-cy=\'name-service-offers-option-input-1\']').should('have.value', 'Maquillage 2');
																					cy.get('[data-cy=\'description-service-offers-option-input-1\']').should('have.value', 'Maquillage de soirée 2');
																					cy.get('[data-cy=\'price-service-offers-option-input-1\']').should('have.value', '50€ 2');
																					cy.get('[data-cy=\'name-service-offers-option-input-2\']').should('have.value', 'Maquillage 3');
																					cy.get('[data-cy=\'description-service-offers-option-input-2\']').should('have.value', 'Maquillage de soirée 3');
																					cy.get('[data-cy=\'price-service-offers-option-input-2\']').should('have.value', '50€ 3');

																					// 		** modify the service **
																					cy.get('[data-cy=\'name-service-offers-input\']').clear().type('Maquillage Modified');
																					cy.get('[data-cy=\'description-service-offers-input\']').clear().type('Maquillage de soirée Modified');
																					cy.get('[data-cy=\'price-service-offers-input\']').clear().type('50€ Modified');

																					// 		** modify the options **
																					cy.get('[data-cy=\'name-service-offers-option-input-0\']').clear().type('Maquillage 1 Modified');
																					cy.get('[data-cy=\'description-service-offers-option-input-0\']').clear().type('Maquillage de soirée 1 Modified');
																					cy.get('[data-cy=\'price-service-offers-option-input-0\']').clear().type('50€ 1 Modified');
																					cy.get('[data-cy=\'name-service-offers-option-input-1\']').clear().type('Maquillage 2 Modified');
																					cy.get('[data-cy=\'description-service-offers-option-input-1\']').clear().type('Maquillage de soirée 2 Modified');
																					cy.get('[data-cy=\'price-service-offers-option-input-1\']').clear().type('50€ 2 Modified');
																					cy.get('[data-cy=\'name-service-offers-option-input-2\']').clear().type('Maquillage 3 Modified');
																					cy.get('[data-cy=\'description-service-offers-option-input-2\']').clear().type('Maquillage de soirée 3 Modified');
																					cy.get('[data-cy=\'price-service-offers-option-input-2\']').clear().type('50€ 3 Modified');

																					// 		** submit the form **
																					// save & add the service
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
																									cy.wait('@patchMeMakeup').its('response.statusCode').should('eq', 200);

																									cy.get('[data-cy=\'profil-public-view\']').click().then(() => {
																										cy.wait(1000);

																										cy.get('[data-cy=\'service-offer-button-0\']').click({ force: true }).then(
																											() => {
																												cy.get('[data-cy=\'service-offer-button-1\']').click({ force: true }).then(
																													() => {
																														cy.get('[data-cy=\'service-offer-button-2\']').click({ force: true }).then(
																															() => {
																																// 	service offers
																																cy.get('[data-cy=\'service-offer-name\']').should('contain', 'Maquillage Modified');
																																cy.get('[data-cy=\'service-offer-description\']').should('contain', 'Maquillage de soirée Modified');
																																cy.get('[data-cy=\'service-offer-price\']').should('contain', '50€ Modified');
																																cy.get('[data-cy=\'service-offer-name-0\']').should('contain', 'Maquillage 1 Modified');
																																cy.get('[data-cy=\'service-offer-description-0\']').should('contain', 'Maquillage de soirée 1 Modified');
																																cy.get('[data-cy=\'service-offer-price-0\']').should('contain', '50€ 1 Modified');
																																cy.get('[data-cy=\'service-offer-name-1\']').should('contain', 'Maquillage 2 Modified');
																																cy.get('[data-cy=\'service-offer-description-1\']').should('contain', 'Maquillage de soirée 2 Modified');
																																cy.get('[data-cy=\'service-offer-price-1\']').should('contain', '50€ 2 Modified');
																																cy.get('[data-cy=\'service-offer-name-2\']').should('contain', 'Maquillage 3 Modified');
																																cy.get('[data-cy=\'service-offer-description-2\']').should('contain', 'Maquillage de soirée 3 Modified');
																																cy.get('[data-cy=\'service-offer-price-2\']').should('contain', '50€ 3 Modified');
																															},
																														);
																													},
																												);
																											},
																										);
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

	// (test thee section & max number upload + max size upload)
	describe('Portefolio - section - (min, max, required)', () => {
		it('tests complet Portefolio - section', () => {
			// upload image
			cy.visit('http://localhost:3000/auth/profil').then(() => {
				cy.wait(1000);
				// prepare the file to upload (big image)
				cy.fixture('./assets/big_image.jpg', { encoding: null }).as('bigImage');

				// 001-bathing.webp
				cy.fixture('./assets/001-bathing.webp', { encoding: null }).as('pictureCat1');
				// 002-photograph.webp
				cy.fixture('./assets/002-photograph.webp', { encoding: null }).as('pictureCat2');
				// 003-message.webp
				cy.fixture('./assets/003-message.webp', { encoding: null }).as('pictureCat3');
				// 004-family.webp
				cy.fixture('./assets/004-family.webp', { encoding: null }).as('pictureCat4');
				// 005-father and son.webp
				cy.fixture('./assets/005-father and son.webp', { encoding: null }).as('pictureCat5');
				// 006-family.webp
				cy.fixture('./assets/006-family.webp', { encoding: null }).as('pictureCat6');
				// 007-bubbles.webp
				cy.fixture('./assets/007-bubbles.webp', { encoding: null }).as('pictureCat7');
				// 008-ice cream.webp
				cy.fixture('./assets/008-ice cream.webp', { encoding: null }).as('pictureCat8');
				// 009-reading.webp
				cy.fixture('./assets/009-reading.webp', { encoding: null }).as('pictureCat9');
				// 010-sleeping.webp
				cy.fixture('./assets/010-sleeping.webp', { encoding: null }).as('pictureCat10');
				// 011-family.webp
				cy.fixture('./assets/011-family.webp', { encoding: null }).as('pictureCat11');

				// prepare to intercept the request
				cy.intercept('POST', 'https://api.my-makeup.fr/api/upload').as('upload');

				cy.get('[data-cy=\'update-portefolio-button\']')
					.click({ force: true })
					.then(() => {
						cy.get('body').then($body => {
							if ($body.find('[data-cy=\'delete-button-portefolio\']').length > 0) {
								cy.get('[data-cy=\'delete-button-portefolio\']').then($elems => {
									const deleteButtons = $elems.length;

									for (let i = 0; i < deleteButtons; i++) {
										cy.get('[data-cy=\'delete-button-portefolio\']').first().click();
										cy.wait(100);
									}
								});
							}
						});

						cy.wait(1000);

						cy.get('[data-cy=\'file-upload-portefolio\']').selectFile('@bigImage', {
							force: true,
						});

						cy.wait(1000);

						cy.get('[data-cy=\'add-button-portefolio\']')
							.click({ force: true })
							.then(() => {
								cy.wait(1000);

								cy.get(`[id=toast-alert]`).should('contain', 'Le fichier est trop grand, veuillez télécharger un fichier de moins de 1.5 Mo.');

								cy.get('[data-cy=\'file-upload-portefolio\']').selectFile('@pictureCat1', {
									force: true,
								});

								cy.wait(1000);

								cy.get('[data-cy=\'add-button-portefolio\']')
									.click({ force: true })
									.then(() => {
										cy.wait('@upload').its('response.statusCode').should('eq', 200);

										cy.get('[data-cy=\'file-upload-portefolio\']').selectFile('@pictureCat2', {
											force: true,
										});

										cy.wait(1000);

										cy.get('[data-cy=\'add-button-portefolio\']')
											.click({ force: true })
											.then(() => {
												cy.wait('@upload').its('response.statusCode').should('eq', 200);
												cy.get('[data-cy=\'file-upload-portefolio\']').selectFile('@pictureCat3', {
													force: true,
												});

												cy.wait(1000);

												cy.get('[data-cy=\'add-button-portefolio\']')
													.click({ force: true })
													.then(() => {
														cy.wait('@upload').its('response.statusCode').should('eq', 200);
														cy.get('[data-cy=\'file-upload-portefolio\']').selectFile('@pictureCat4', {
															force: true,
														});

														cy.wait(1000);

														cy.get('[data-cy=\'add-button-portefolio\']')
															.click({ force: true })
															.then(() => {
																cy.wait('@upload').its('response.statusCode').should('eq', 200);
																cy.get('[data-cy=\'file-upload-portefolio\']').selectFile('@pictureCat5', {
																	force: true,
																});

																cy.wait(1000);

																cy.get('[data-cy=\'add-button-portefolio\']')
																	.click({ force: true })
																	.then(() => {
																		cy.wait('@upload').its('response.statusCode').should('eq', 200);
																		cy.get('[data-cy=\'file-upload-portefolio\']').selectFile('@pictureCat6', {
																			force: true,
																		});

																		cy.wait(1000);

																		cy.get('[data-cy=\'add-button-portefolio\']')
																			.click({ force: true })
																			.then(() => {
																				cy.wait('@upload').its('response.statusCode').should('eq', 200);

																				cy.get('[data-cy=\'file-upload-portefolio\']').selectFile('@pictureCat7', {
																					force: true,
																				});

																				cy.wait(1000);

																				cy.get('[data-cy=\'add-button-portefolio\']')
																					.click({ force: true })
																					.then(() => {
																						cy.wait('@upload').its('response.statusCode').should('eq', 200);

																						cy.get('[data-cy=\'file-upload-portefolio\']').selectFile('@pictureCat8', {
																							force: true,
																						});

																						cy.wait(1000);

																						cy.get('[data-cy=\'add-button-portefolio\']')
																							.click({ force: true })
																							.then(() => {
																								cy.wait('@upload').its('response.statusCode').should('eq', 200);

																								cy.get('[data-cy=\'file-upload-portefolio\']').selectFile('@pictureCat9', {
																									force: true,
																								});

																								cy.wait(1000);

																								cy.get('[data-cy=\'add-button-portefolio\']')
																									.click({ force: true })
																									.then(() => {
																										cy.wait('@upload').its('response.statusCode').should('eq', 200);

																										cy.get('[data-cy=\'file-upload-portefolio\']').selectFile('@pictureCat10', {
																											force: true,
																										});

																										cy.wait(1000);

																										cy.get('[data-cy=\'add-button-portefolio\']')
																											.click({ force: true })
																											.then(() => {
																												cy.wait('@upload').its('response.statusCode').should('eq', 200);

																												cy.get('[data-cy=\'file-upload-portefolio\']').selectFile('@pictureCat11', {
																													force: true,
																												});
																												cy.wait(1000);

																												cy.get('[data-cy=\'add-button-portefolio\']')
																													.click({ force: true })
																													.then(() => {
																														cy.wait(1000);

																														cy.get(`[id=toast-alert]`).should('contain', 'La limite du nombre de photos est atteinte.');

																														cy.wait(1000);

																														cy.get('[data-cy=\'save-button-portefolio\']')
																															.click({
																																force: true,
																															})
																															.then(() => {
																																// wait for the update to finish
																																cy.wait('@patchMeMakeup').its('response.statusCode').should('eq', 200);

																																cy.wait(1000);

																																cy.get('[data-cy=\'update-portefolio-button\']')
																																	.click({ force: true })
																																	.then(() => {
																																		cy.get('body').then($body => {
																																			if ($body.find('[data-cy=\'delete-button-portefolio\']').length > 0) {
																																				cy.get('[data-cy=\'delete-button-portefolio\']').then($elems => {
																																					const deleteButtons = $elems.length;

																																					for (let i = 0; i < deleteButtons; i++) {
																																						cy.get('[data-cy=\'delete-button-portefolio\']').first().click();
																																						cy.wait(100);
																																					}
																																				});
																																			}
																																			cy.get('[data-cy=\'save-button-portefolio\']')
																																				.click({
																																					force: true,
																																				})
																																				.then(() => {
																																					// wait for the update to finish
																																					cy.wait('@patchMeMakeup').its('response.statusCode').should('eq', 200);
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
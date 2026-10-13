import { Dialog, Transition } from '@headlessui/react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSession } from 'next-auth/react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import * as zod from 'zod'
import {
	AnnonceRetrait,
	BoutonFermer,
	BoutonSauvegarder,
	ErreurSauvegarde,
	FondModale,
	focusApresRetrait,
	ignorerEntreeMaintenue,
	useAnnonceRetrait,
	useEnvoi,
} from '@/components/Profil/Atoms/ModalUpdate/ModalElements'
import { dejaDansLaListe } from '@/lib/sauvegarde-profil'
import { patchMeMakeup } from '@/services/PatchMeMakeup'

const schema = zod
	.object({
		language: zod
			.string()
			.min(1, 'La langue est requise.')
			.max(70, 'La langue ne doit pas dépasser 70 caractères.')
			.or(zod.literal('')),
	})
	.required({ language: true })

// A language added in the modal has no id yet, and « Retirer » finds a chip
// by its id: it gets a local one that no other chip can share. Its name was
// its id, so two chips with the same name were removed together. Never
// sent: the PATCH holds the names only (onSubmit).
let compteurLocal = 0

// A name already in the list (dejaDansLaListe) is not added a second time:
// said under the field, where the name stays. The chips stored twice before
// that stay as they are, each removed on its own.
const DEJA_DANS_LA_LISTE = 'Cette langue est déjà dans la liste.'

export default function ModalUpdateLanguageProfil(props) {
	const user = props.user

	const {
		register,
		handleSubmit,
		formState: { errors },
		reset,
		setValue,
		trigger,
		setError,
	} = useForm({
		resolver: zodResolver(schema),
	})

	const [open, setOpen] = useState(props.isModalOpen)
	const [userLanguage, setUserLanguage] = useState('')
	const [userLanguageSelected, setUserLanguageSelected] = useState(user.language ?? [])

	// Escape, a click outside and « Fermer » wait for the save in progress
	const { envoi, setEnvoi, erreurEnvoi, setErreurEnvoi, fermer } = useEnvoi(props.isModalOpen, props.handleIsModalOpen)
	// each removal is said to screen readers (AnnonceRetrait)
	const { annonce, annoncer } = useAnnonceRetrait(props.isModalOpen)

	const { data: session } = useSession()

	/**
	 * onSubmit function called when the form is submitted
	 * @param data
	 */
	const onSubmit = async _data => {
		// for each item selected, we only keep the name, the id is not necessary
		const champs = {
			language: userLanguageSelected.map(item => ({ name: item.name })),
		}
		setEnvoi(true)
		setErreurEnvoi(null)
		const resultat = await patchMeMakeup(session, champs, 'langues')
		setEnvoi(false)
		if (!resultat.ok) {
			setErreurEnvoi(resultat.error ?? null)
			return
		}
		// shown on the page once the API stored it, then the modal closes
		props.handleUpdateUser({ ...user, ...champs })
		props.handleIsModalOpen()
	}

	useEffect(() => {
		setOpen(props.isModalOpen)
	}, [props.isModalOpen])

	const cancelButtonRef = useRef(null)
	// where the keyboard focus goes when the list is left empty (focusApresRetrait)
	const champLangue = useRef(null)
	// and where it goes when a click or a tap leaves it empty: the title of
	// the modal, focusable by script only (tabindex -1). The focus stays in
	// the modal instead of falling on <body> with the chip, and no field takes
	// it, so the virtual keyboard of a phone stays closed. From there Tab
	// leads to the field, Shift+Tab to « Fermer ».
	const titre = useRef(null)
	const { ref: enregistrerChamp, ...champEnregistre } = register('language', {
		required: true,
	})

	const handleUpdateLanguage = event => {
		// check if the entered value is a ';' and if so, add it to the array
		if (event.target.value.slice(-1) === ';') {
			// the language typed before the separator, without it
			const nom = event.target.value.slice(0, -1).trim()
			if (nom !== '') {
				// the name itself is checked (70 characters at most), even when
				// pasted with its ';' in one go, then added
				setValue('language', nom)
				trigger('language').then(isValid => {
					const doublon = isValid && dejaDansLaListe(userLanguageSelected, nom)
					if (isValid && !doublon) {
						setUserLanguageSelected(userLanguageSelected.concat({ id: `local-${++compteurLocal}`, name: nom }))
						setUserLanguage('')
					} else setUserLanguage(nom)
					if (doublon) setError('language', { type: 'manual', message: DEJA_DANS_LA_LISTE })
				})
			} else {
				setError('language', {
					type: 'manual',
					message: 'La langue est requise.',
				})
			}
			return
		}

		if (event.target.value.trim() === '') {
			// 	trigger the error message if the input is empty
			setUserLanguage(event.target.value)
			setValue('language', event.target.value)
			setError('language', {
				type: 'manual',
				message: 'La langue est requise.',
			})
		} else {
			setUserLanguage(event.target.value)
			setValue('language', event.target.value)
			trigger('language')
		}
	}

	const handleDeleteLanguageelected = id => {
		const retiree = userLanguageSelected.find(item => item.id === id)
		if (retiree) annoncer(`Langue ${retiree.name ?? ''} retirée`)
		setUserLanguageSelected(userLanguageSelected.filter(item => item.id !== id))
	}

	// reset the form when the modal is closed
	useEffect(() => {
		if (!open) {
			setUserLanguage('')
			setUserLanguageSelected(user.language ?? [])
			reset()
		}
	}, [open, reset, user.language])

	useEffect(() => {
		if (user?.language) {
			// Add an id to each skill
			const languagesWithId = user.language.map((language, index) => {
				return {
					id: index, // Use the index as an id
					name: language.name,
				}
			})
			setUserLanguageSelected(languagesWithId)
		} else {
			setUserLanguageSelected([])
		}
	}, [open, user])

	// The message of a name refused as already in the list is true as long as
	// the name is there. Once the last chip that held it is removed, it is not
	// shown any more: the name is free, and Enter adds it.
	const erreurLangue =
		errors.language?.message === DEJA_DANS_LA_LISTE && !dejaDansLaListe(userLanguageSelected, userLanguage)
			? undefined
			: errors.language

	return (
		<Transition.Root show={open} as={Fragment}>
			<Dialog as="div" className="relative z-30" initialFocus={cancelButtonRef} onClose={fermer}>
				<FondModale />

				<div className="fixed inset-0 z-30 overflow-y-auto">
					<div className="flex min-h-full items-center justify-center p-4 text-center">
						<Transition.Child
							as={Fragment}
							enter="ease-out duration-300"
							enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
							enterTo="opacity-100 translate-y-0 sm:scale-100"
							leave="ease-in duration-200"
							leaveFrom="opacity-100 translate-y-0 sm:scale-100"
							leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
						>
							<Dialog.Panel
								data-cy="modal-panel"
								onKeyDownCapture={ignorerEntreeMaintenue}
								className="relative w-full transform rounded-lg bg-white p-8 text-left shadow-2xl transition-all sm:max-w-3xl"
							>
								<BoutonFermer onClick={fermer} disabled={envoi} ref={cancelButtonRef} />
								<div className="flex flex-col items-start gap-8">
									<div className="text-left">
										<Dialog.Title
											as="h3"
											ref={titre}
											tabIndex={-1}
											className="text-lg font-semibold text-gray-900 focus:outline-none"
										>
											Les langues que vous pouvez parler
										</Dialog.Title>
									</div>
									<div className={'w-full md:w-3/5'}>
										<div className="grid grid-cols-1 gap-4">
											<div className={'flex flex-col gap-4'}>
												<form onSubmit={handleSubmit(onSubmit)} method="POST" className="flex flex-col gap-4">
													<div>
														<label htmlFor="language" className="block text-sm text-gray-700">
															Langues
														</label>
														<p className={'text-xs italic text-gray-700/70'}>
															Vous pouvez ajouter plusieurs langues en les séparant par un point-virgule, ou en appuyant
															sur la touche entrée.
														</p>
														<div className="mt-2">
															<input
																data-cy="language-input"
																id="language"
																name="language"
																type={'text'}
																{...champEnregistre}
																ref={noeud => {
																	enregistrerChamp(noeud)
																	champLangue.current = noeud
																}}
																required
																// its message is read with the field
																aria-invalid={!!erreurLangue}
																aria-describedby={erreurLangue ? 'language-erreur' : undefined}
																onKeyPress={async event => {
																	if (event.key === 'Enter') {
																		event.preventDefault()
																		// Enter held on the only chip repeats here once the field
																		// has the focus: nothing was typed, no message to show
																		if (event.repeat) return
																		// Trigger a validation before adding the skill
																		const isValid = await trigger('language')
																		if (isValid) {
																			if (dejaDansLaListe(userLanguageSelected, event.target.value)) {
																				setError('language', {
																					type: 'manual',
																					message: DEJA_DANS_LA_LISTE,
																				})
																			} else if (event.target.value.trim() !== '') {
																				// 	add the skill to the array
																				// 	empty the input
																				setUserLanguageSelected([
																					...userLanguageSelected,
																					{
																						id: `local-${++compteurLocal}`,
																						name: event.target.value,
																					},
																				])
																				setUserLanguage('')
																			} else {
																				setError('language', {
																					type: 'manual',
																					message: 'La langue est requise.',
																				})
																			}
																		}
																	}
																}}
																value={userLanguage ?? ''}
																onChange={handleUpdateLanguage}
																className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
															/>
															{erreurLangue && (
																<p
																	id="language-erreur"
																	data-cy={'error-language'}
																	// a refusal is said at once; the other messages come while
																	// typing and are read with the field
																	role={erreurLangue.message === DEJA_DANS_LA_LISTE ? 'alert' : undefined}
																	className={'mt-2 text-xs text-red-500/80'}
																>
																	{erreurLangue.message}
																</p>
															)}
														</div>
													</div>
													<div className={'flex flex-col gap-2'}>
														<h3 className={'text-sm text-gray-700'}>Langues ajoutées</h3>
														<div className={'flex w-full flex-col flex-wrap items-start gap-2'}>
															{userLanguageSelected.map((skill, index) => (
																<button
																	data-cy="language-selected"
																	type={'button'}
																	// the chip is the row and its « Retirer »
																	data-ligne
																	data-retirer
																	onClick={event => {
																		// detail 0: Enter or Space, the field takes the focus.
																		// A click or a tap must not focus it (the virtual
																		// keyboard of a phone would open): the title does.
																		const repli = event.detail === 0 ? champLangue.current : titre.current
																		focusApresRetrait(event.currentTarget, repli)
																		handleDeleteLanguageelected(skill.id)
																	}}
																	// biome-ignore lint/suspicious/noArrayIndexKey: the row keeps its node when another is removed, so the keyboard focus stays in the list
																	key={index}
																	aria-label={`Retirer ${skill.name}`}
																	className={
																		'flex min-h-[44px] items-center gap-2 rounded-full bg-indigo-50 px-3 text-sm text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600'
																	}
																>
																	<span>→ {skill.name}</span>
																	<span className="material-icons-round text-sm" aria-hidden="true">
																		close
																	</span>
																</button>
															))}
														</div>
													</div>
												</form>
											</div>
										</div>
									</div>
								</div>
								<div className="mt-4 flex flex-col items-end gap-4">
									<ErreurSauvegarde message={erreurEnvoi} />
									<BoutonSauvegarder dataCy="save-button-languages" envoi={envoi} onClick={handleSubmit(onSubmit)} />
								</div>
								<AnnonceRetrait annonce={annonce} />
							</Dialog.Panel>
						</Transition.Child>
					</div>
				</div>
			</Dialog>
		</Transition.Root>
	)
}

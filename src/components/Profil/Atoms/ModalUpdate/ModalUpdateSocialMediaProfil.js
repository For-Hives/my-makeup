import { Dialog, Transition } from '@headlessui/react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSession } from 'next-auth/react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import * as zod from 'zod'
import {
	BoutonFermer,
	BoutonSauvegarder,
	ErreurSauvegarde,
	FondModale,
	suivreChamp,
	useEnvoi,
} from '@/components/Profil/Atoms/ModalUpdate/ModalElements'
import { patchMeMakeup } from '@/services/PatchMeMakeup'

const schema = zod.object({
	youtube: zod
		.string()
		.url({ message: 'Veuillez entrer une URL valide (https://...).' })
		.max(200, "L'URL ne doit pas dépasser 200 caractères.")
		.optional()
		.or(zod.literal('')),
	facebook: zod
		.string()
		.url({ message: 'Veuillez entrer une URL valide (https://...).' })
		.max(200, "L'URL ne doit pas dépasser 200 caractères.")
		.optional()
		.or(zod.literal('')),
	instagram: zod
		.string()
		.url({ message: 'Veuillez entrer une URL valide (https://...).' })
		.max(200, "L'URL ne doit pas dépasser 200 caractères.")
		.optional()
		.or(zod.literal('')),
	website: zod
		.string()
		.url({ message: 'Veuillez entrer une URL valide (https://...).' })
		.max(200, "L'URL ne doit pas dépasser 200 caractères.")
		.optional()
		.or(zod.literal('')),
	linkedin: zod
		.string()
		.url({ message: 'Veuillez entrer une URL valide (https://...).' })
		.max(200, "L'URL ne doit pas dépasser 200 caractères.")
		.optional()
		.or(zod.literal('')),
	email: zod
		.string()
		.email({ message: 'Veuillez entrer un email valide.' })
		.max(200, "L'email ne doit pas dépasser 200 caractères.")
		.optional()
		.or(zod.literal('')),
	phone: zod
		.string()
		.min(10, 'Le numéro de téléphone est requis.')
		.max(20, 'Le numéro de téléphone ne doit pas dépasser 20 caractères.')
		.optional()
		.or(zod.literal('')),
})

function reseauInitial(network) {
	return {
		...network,
		...Object.fromEntries(
			['youtube', 'facebook', 'instagram', 'website', 'linkedin', 'email', 'phone'].map(canal => [
				canal,
				network?.[canal] ?? '',
			])
		),
	}
}

export default function ModalUpdateSocialMediaProfil(props) {
	const user = props.user

	const {
		register,
		handleSubmit,
		formState: { errors },
		reset,
	} = useForm({
		resolver: zodResolver(schema),
	})
	const suivre = suivreChamp(register)

	const [open, setOpen] = useState(props.isModalOpen)
	// the network component may be missing on a new profile
	const reseau = reseauInitial(user.network)

	const [userYoutube, setUserYoutube] = useState(reseau.youtube)
	const [userFacebook, setUserFacebook] = useState(reseau.facebook)
	const [userInstagram, setUserInstagram] = useState(reseau.instagram)
	const [userWebsite, setUserWebsite] = useState(reseau.website)
	const [userLinkedin, setUserLinkedin] = useState(reseau.linkedin)
	const [userEmail, setUserEmail] = useState(reseau.email)
	const [userPhone, setUserPhone] = useState(reseau.phone)

	const { data: session } = useSession()

	// Escape, a click outside and « Fermer » wait for the save in progress
	const { envoi, setEnvoi, erreurEnvoi, setErreurEnvoi, fermer } = useEnvoi(props.isModalOpen, props.handleIsModalOpen)

	// the page shows the new links, and the modal closes, once the API stored them
	const onSubmit = async data => {
		const champs = { network: { ...data } }
		setEnvoi(true)
		setErreurEnvoi(null)
		const resultat = await patchMeMakeup(session, champs, 'reseaux')
		setEnvoi(false)
		if (!resultat.ok) {
			setErreurEnvoi(resultat.error ?? null)
			return
		}
		props.handleUpdateUser({
			...user,
			network: { ...reseau, ...champs.network },
		})
		props.handleIsModalOpen()
	}

	useEffect(() => {
		setOpen(props.isModalOpen)
	}, [props.isModalOpen])

	const cancelButtonRef = useRef(null)

	const handleUpdateYoutube = event => {
		setUserYoutube(event.target.value)
	}
	const handleUpdateFacebook = event => {
		setUserFacebook(event.target.value)
	}
	const handleUpdateInstagram = event => {
		setUserInstagram(event.target.value)
	}
	const handleUpdateWebsite = event => {
		setUserWebsite(event.target.value)
	}
	const handleUpdateLinkedin = event => {
		setUserLinkedin(event.target.value)
	}
	const handleUpdateEmail = event => {
		setUserEmail(event.target.value)
	}
	const handleUpdatePhone = event => {
		setUserPhone(event.target.value)
	}

	useEffect(() => {
		if (!open) {
			setUserYoutube(reseau.youtube ?? '')
			setUserFacebook(reseau.facebook ?? '')
			setUserInstagram(reseau.instagram ?? '')
			setUserWebsite(reseau.website ?? '')
			setUserLinkedin(reseau.linkedin ?? '')
			setUserEmail(reseau.email ?? '')
			setUserPhone(reseau.phone ?? '')
			reset()
		}
	}, [
		open,
		reset,
		reseau.email,
		reseau.facebook,
		reseau.instagram,
		reseau.linkedin,
		reseau.phone,
		reseau.website,
		reseau.youtube,
	])

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
								className="relative w-full transform rounded-lg bg-white p-8 text-left shadow-2xl transition-all sm:max-w-2xl"
							>
								<BoutonFermer onClick={fermer} disabled={envoi} ref={cancelButtonRef} />
								<div className="flex flex-col items-start gap-8">
									<div className="text-left">
										<Dialog.Title as="h3" className="text-lg font-semibold text-gray-900">
											Réseaux sociaux & contacts
										</Dialog.Title>
									</div>
									<div className={'w-full md:w-3/5'}>
										<div className="grid grid-cols-1 gap-4">
											<div className={'flex flex-col gap-4'}>
												<form onSubmit={handleSubmit(onSubmit)} method="POST" className="flex flex-col gap-4">
													<div>
														<label htmlFor="email" className="block text-sm text-gray-700">
															Email
														</label>
														<div className="mt-2">
															<input
																data-cy="email-input"
																id="email"
																name="email"
																type="text"
																{...register('email', {
																	required: false,
																})}
																value={userEmail ?? ''}
																onChange={suivre('email', handleUpdateEmail)}
																className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
															/>
															{errors.email && (
																<p data-cy={'error-email'} className={'mt-2 text-xs text-red-500/80'}>
																	{errors.email.message}
																</p>
															)}
														</div>
													</div>
													<div>
														<label htmlFor="phone" className="block text-sm text-gray-700">
															Numéro de téléphone
														</label>
														<div className="mt-2">
															<input
																data-cy="phone-input"
																id="phone"
																name="phone"
																type="text"
																{...register('phone', {
																	required: false,
																})}
																value={userPhone ?? ''}
																onChange={suivre('phone', handleUpdatePhone)}
																className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
															/>
															{errors.phone && (
																<p data-cy={'error-phone'} className={'mt-2 text-xs text-red-500/80'}>
																	{errors.phone.message}
																</p>
															)}
														</div>
													</div>
													<div>
														<label htmlFor="youtube" className="block text-sm text-gray-700">
															Lien Youtube
														</label>
														<div className="mt-2">
															<input
																data-cy="youtube-input"
																id="youtube"
																name="youtube"
																type="text"
																{...register('youtube', {
																	required: false,
																})}
																value={userYoutube ?? ''}
																onChange={suivre('youtube', handleUpdateYoutube)}
																className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
															/>
															{errors.youtube && (
																<p data-cy={'error-youtube'} className={'mt-2 text-xs text-red-500/80'}>
																	{errors.youtube.message}
																</p>
															)}
														</div>
													</div>
													<div>
														<label htmlFor="facebook" className="block text-sm text-gray-700">
															Lien Facebook
														</label>
														<div className="mt-2">
															<input
																data-cy="facebook-input"
																id="facebook"
																name="facebook"
																type="text"
																{...register('facebook', {
																	required: false,
																})}
																value={userFacebook ?? ''}
																onChange={suivre('facebook', handleUpdateFacebook)}
																className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
															/>
															{errors.facebook && (
																<p data-cy={'error-facebook'} className={'mt-2 text-xs text-red-500/80'}>
																	{errors.facebook.message}
																</p>
															)}
														</div>
													</div>
													<div>
														<label htmlFor="instagram" className="block text-sm text-gray-700">
															Lien Instagram
														</label>
														<div className="mt-2">
															<input
																data-cy="instagram-input"
																id="instagram"
																name="instagram"
																type="text"
																{...register('instagram', {
																	required: false,
																})}
																value={userInstagram ?? ''}
																onChange={suivre('instagram', handleUpdateInstagram)}
																className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
															/>
															{errors.instagram && (
																<p data-cy={'error-instagram'} className={'mt-2 text-xs text-red-500/80'}>
																	{errors.instagram.message}
																</p>
															)}
														</div>
													</div>
													<div>
														<label htmlFor="website" className="block text-sm text-gray-700">
															Lien de votre site internet
														</label>
														<div className="mt-2">
															<input
																data-cy="website-input"
																id="website"
																name="website"
																type="text"
																{...register('website', {
																	required: false,
																})}
																value={userWebsite ?? ''}
																onChange={suivre('website', handleUpdateWebsite)}
																className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
															/>
															{errors.website && (
																<p data-cy={'error-website'} className={'mt-2 text-xs text-red-500/80'}>
																	{errors.website.message}
																</p>
															)}
														</div>
													</div>
													<div>
														<label htmlFor="linkedin" className="block text-sm text-gray-700">
															Lien linkedin
														</label>
														<div className="mt-2">
															<input
																data-cy="linkedin-input"
																id="linkedin"
																name="linkedin"
																type="text"
																{...register('linkedin', {
																	required: false,
																})}
																value={userLinkedin ?? ''}
																onChange={suivre('linkedin', handleUpdateLinkedin)}
																className="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
															/>
															{errors.linkedin && (
																<p data-cy={'error-linkedin'} className={'mt-2 text-xs text-red-500/80'}>
																	{errors.linkedin.message}
																</p>
															)}
														</div>
													</div>
												</form>
											</div>
										</div>
									</div>
								</div>
								<div className="mt-4 flex flex-col items-end gap-4">
									<ErreurSauvegarde message={erreurEnvoi} />
									<BoutonSauvegarder
										dataCy="save-button-social-medias"
										envoi={envoi}
										onClick={handleSubmit(onSubmit)}
									/>
								</div>
							</Dialog.Panel>
						</Transition.Child>
					</div>
				</div>
			</Dialog>
		</Transition.Root>
	)
}

import React from 'react'
import { OptionsOffers } from '@/components/Profil/Childs/ServiceOffers/OptionsOffers'
import { DescriptionPriceOffer } from '@/components/Profil/Childs/ServiceOffers/DescriptionPriceOffer'
import { Tab } from '@headlessui/react'
import { useRouter } from 'next/router'
import ModalUpdateServiceOffersProfil from '@/components/Profil/Atoms/ModalUpdate/ModalUpdateServiceOffersProfil'

export function ServiceOffersProfil(props) {
	// import router
	const router = useRouter()
	// get query param
	const { publicView } = router.query
	const isPublic = !!publicView

	const user = props.user

	const [modalUpdateServiceOffersProfil, setModalUpdateServiceOffersProfil] =
		React.useState(false)
	const handleModalUpdateServiceOffersProfil = () => {
		if (!isPublic) {
			setModalUpdateServiceOffersProfil(!modalUpdateServiceOffersProfil)
		}
	}

	return (
		<div className={'relative w-full'}>
			<ModalUpdateServiceOffersProfil
				modalUpdateServiceOffersProfil={modalUpdateServiceOffersProfil}
				handleModalUpdateServiceOffersProfil={
					handleModalUpdateServiceOffersProfil
				}
				user={user}
			/>
			<div
				className={
					(!isPublic ? 'group relative' : '') +
					' flex w-full flex-col gap-4 rounded border border-slate-300 bg-white p-8 '
				}
			>
				{!isPublic ? (
					<button
						onClick={handleModalUpdateServiceOffersProfil}
						className={
							'absolute left-0 top-0 -z-10 flex h-full w-full items-center justify-center opacity-0 ' +
							'bg-white/75 backdrop-blur-none group-hover:z-20 group-hover:opacity-100 ' +
							'pointer-events-none transition duration-300 group-hover:pointer-events-auto group-hover:backdrop-blur-[2px] ' +
							'user-select-none group-hover:user-select-auto focus:outline-none'
						}
					>
						<div
							className={
								'btn-alt-primary flex items-center gap-3 bg-white text-indigo-900'
							}
						>
							<span className="material-icons-round">edit</span>
							<span className={'font-semibold'}>Modifier vos prestations</span>
						</div>
					</button>
				) : null}
				<h2 className={'text-xl font-bold text-slate-700'}>
					Service(s) proposé(s)
				</h2>
				<Tab.Group>
					<Tab.List className={'flex h-full w-full justify-center py-4'}>
						{user?.service_offers.map((service_offer, index) => {
							return (
								<Tab
									key={index}
									className={
										'h-auto w-full border-b-2 border-slate-300/20 bg-slate-50/30 p-4 text-xs text-slate-600 hover:bg-slate-50/50 focus:outline-none ' +
										// 	aria selected
										' aria-selected:border-b-2 aria-selected:border-indigo-800  aria-selected:text-slate-900'
									}
								>
									{service_offer.name}
								</Tab>
							)
						})}
					</Tab.List>
					<Tab.Panels>
						{user?.service_offers.map((service_offer, index) => {
							return (
								<Tab.Panel key={index}>
									<div className={'flex flex-col gap-4 bg-white py-4'}>
										<div className={'flex flex-col'}>
											<h2
												className={
													'text-start text-lg font-bold text-indigo-900'
												}
											>
												{service_offer.name}
											</h2>
										</div>
										<DescriptionPriceOffer serviceOffer={service_offer} />
									</div>
									<div className={'flex w-full flex-col gap-2 py-2'}>
										<OptionsOffers serviceOffer={service_offer} />
									</div>
								</Tab.Panel>
							)
						})}
					</Tab.Panels>
				</Tab.Group>
			</div>
		</div>
	)
}

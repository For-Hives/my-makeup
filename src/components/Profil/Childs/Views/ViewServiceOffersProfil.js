import { Tab } from '@headlessui/react'
import { DescriptionPriceOffer } from '@/components/Profil/Childs/ServiceOffers/DescriptionPriceOffer'
import { OptionsOffers } from '@/components/Profil/Childs/ServiceOffers/OptionsOffers'
import { avecCles } from '@/lib/cles'
import { offres as offresNommees, texte } from '@/lib/profil/vue-publique'

// Read from the props only. Every panel is rendered (unmount={false}, the
// others hidden), so all the offers and their prices are in the server HTML.
function ViewServiceOffersProfil({ user }) {
	const offres = offresNommees(user)

	return (
		<div className={'flex w-full flex-col gap-4'}>
			<h2 className={'text-xl font-bold text-gray-700'}>Service(s) proposé(s)</h2>
			{offres.length > 0 && (
				<Tab.Group>
					<Tab.List
						className={`${
							offres.length <= 3 ? 'md:justify-center md:overflow-auto' : 'md:justify-start md:overflow-x-scroll'
						} flex h-full w-full justify-start overflow-x-scroll py-4`}
					>
						{avecCles(offres).map(({ valeur: service_offer, cle }, _index) => (
							<Tab
								key={cle}
								className={
									'h-auto w-full border-b-2 border-gray-300/20 bg-gray-50/30 p-4 text-xs text-gray-600 hover:bg-gray-50/50 focus:outline-none ' +
									// 	aria selected
									' aria-selected:border-b-2 aria-selected:border-indigo-800 aria-selected:text-gray-900'
								}
							>
								{texte(service_offer.name)}
							</Tab>
						))}
					</Tab.List>
					<Tab.Panels>
						{avecCles(offres).map(({ valeur: service_offer, cle }, _index) => (
							<Tab.Panel key={cle} unmount={false}>
								<div className={'flex flex-col gap-4 bg-white py-4'}>
									<div className={'flex flex-col'}>
										<h3 className={'text-start text-lg font-bold text-indigo-900'} data-cy={'service-offer-name'}>
											{texte(service_offer.name)}
										</h3>
									</div>
									<DescriptionPriceOffer serviceOffer={service_offer} index={null} />
								</div>
								<div className={'flex w-full flex-col gap-2 py-2'}>
									<OptionsOffers serviceOffer={service_offer} />
								</div>
							</Tab.Panel>
						))}
					</Tab.Panels>
				</Tab.Group>
			)}
		</div>
	)
}

export default ViewServiceOffersProfil

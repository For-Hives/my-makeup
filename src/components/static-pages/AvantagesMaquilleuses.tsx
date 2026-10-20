import { AVANTAGES_MAQUILLEUSES } from './textes-maquilleuses'

function IconeCoche() {
	return (
		<svg
			className="h-6 w-6 text-green-500"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.5}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
		</svg>
	)
}

/** The advantages of joining, on « Pourquoi rejoindre My-Makeup en tant que maquilleuse ». */
export function AvantagesMaquilleuses() {
	return (
		<section className="bg-neutral-50 py-24">
			<div className="overflow-hidden bg-neutral-50 px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
				<div className="relative mx-auto max-w-screen-2xl">
					<div className="text-center">
						<h2 className="font-extrabold text-3xl text-gray-900 tracking-tight sm:text-4xl">Nos Avantages</h2>
						<p className="mt-4 text-gray-500 text-lg leading-6">
							Pourquoi choisir My&nbsp;Makeup ? Voici quelques-uns de nos avantages.
						</p>
					</div>
					<div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
						{AVANTAGES_MAQUILLEUSES.map(avantage => (
							<div key={avantage.titre} className="pt-6">
								<div className="flow-root rounded-lg px-6 pb-8">
									<div className="flex flex-col gap-4">
										<div className="flex items-center">
											<span className="inline-block rounded-md pr-3">
												<IconeCoche />
											</span>
											<h3 className="font-medium text-gray-900 text-lg tracking-tight">{avantage.titre}</h3>
										</div>
										<p className="text-base text-gray-500">{avantage.texte}</p>
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
			</div>
		</section>
	)
}

import React from 'react'
import Image from 'next/image'
import { Stars } from '@/components/Profil/Stars'
import { BadgeIndispo } from '@/components/Profil/BadgeIndispo'
import { BadgeDispo } from '@/components/Profil/BadgeDispo'

function InfosProfil(props) {
	const user = props.user
	return (
		<div className={''}>
			<div className="mx-auto max-w-7xl">
				<div className={'grid grid-cols-12 gap-5 pt-24'}>
					<div className={'col-span-4 flex items-start'}>
						<div
							className={
								'flex w-full flex-col gap-4 rounded border border-slate-300 bg-white p-8'
							}
						>
							<h2 className={'text-xl font-bold text-slate-700'}>
								Localisation & département
							</h2>
							<div className={'flex gap-2'}>
								<span className="material-symbols-rounded text-lg text-indigo-900">
									location_on
								</span>
								<div className={'flex flex-col gap-2'}>
									<h3 className={'text-lg font-semibold text-slate-700'}>
										Localisation
									</h3>
									<p className={'text-slate-800'}>{user.city}</p>
								</div>
							</div>
							<div className={'flex gap-2'}>
								<span className="material-symbols-rounded text-lg text-indigo-900">
									<span className="material-symbols-outlined">
										directions_run
									</span>
								</span>
								<div className={'flex flex-col gap-2'}>
									<h3 className={'text-lg font-semibold text-slate-700'}>
										Peut travailer chez vous à
									</h3>
									<p className={'text-slate-800'}>
										{user.city} & {user.action_radius}km autour
									</p>
								</div>
							</div>
						</div>
					</div>
					<div className={'col-span-8 flex items-start'}>
						<div
							className={
								'flex w-full flex-col gap-4 rounded border border-slate-300 bg-white p-8'
							}
						>
							<h2 className={'text-xl font-bold text-slate-700'}>
								Vous en quelques mots
							</h2>
							{
								// display the user description
								// if \n is present, split the string and display each part in a new line
								user.description.split('\n').map((item, i) => {
									return (
										<p key={i} className={'text-slate-800'}>
											{item}
										</p>
									)
								})
							}
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}

export default InfosProfil

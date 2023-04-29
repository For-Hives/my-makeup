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
				<div className={'grid grid-cols-12 gap-5 pt-[100px]'}>
					<div className={'col-span-4 flex items-start'}>
						<div
							className={
								'flex w-full flex-col rounded border border-slate-300 bg-white p-8'
							}
						>
							<h2 className={'text-xl font-bold text-slate-700'}>
								Localisation & département
							</h2>
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

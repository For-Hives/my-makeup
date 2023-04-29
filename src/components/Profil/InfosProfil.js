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
					<div className={'col-span-4 flex items-center'}>
						<div
							className={
								'flex h-full w-full flex-col rounded border border-slate-300 bg-white p-5'
							}
						>
							<h2 className={'text-xl font-bold text-slate-700'}>
								Vous en quelques mots
							</h2>
						</div>
					</div>
					<div className={'col-span-8 flex items-center'}>
						<div
							className={
								'flex h-full w-full flex-col rounded border border-slate-300 bg-white p-5'
							}
						>
							<h2 className={'text-xl font-bold text-slate-700'}>
								Vous en quelques mots
							</h2>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}

export default InfosProfil

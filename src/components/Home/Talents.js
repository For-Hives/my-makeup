import React from 'react'
import CardDemo from '@/components/Global/Card-demo'
import { convertStringToKebabCase } from '@/services/utils'

const TalentList = [
	{
		name: 'Maquillage mariée',
	},
	{
		name: 'Maquillage soirée',
	},
	{
		name: 'Maquillage professionnel',
	},
	{
		name: 'Maquillage enfant',
	},
	{
		name: 'Maquillage spécialisé',
	},
	{
		name: 'Maquillage homme',
	},
	{
		name: 'Maquillage femme',
	},
	{
		name: 'Maquillage de fête',
	},
	{
		name: 'Maquillage de soirée',
	},
	{
		name: 'Maquillage de film',
	},
	{
		name: 'Maquillage de théâtre',
	},
	{
		name: 'Maquillage FX',
	},
	{
		name: 'Maquillage beauté',
	},
	{
		name: 'Maquillage artistique',
	},
	{
		name: 'Maquillage cinéma',
	},
]

function Talents(props) {
	return (
		<section className={'relative py-20'}>
			<div className="mx-auto max-w-7xl py-10">
				<div className="mx-auto">
					<h2 className="text-right text-4xl font-bold tracking-tight text-slate-900 sm:text-4xl">
						Vos projets, nos meilleurs talents.
					</h2>
				</div>
			</div>
			<div className="mx-auto max-w-7xl">
				<div className="mx-auto flex w-full gap-24">
					<div
						className={'relative flex h-auto w-1/5 items-center justify-center'}
					>
						<div
							className={
								'absolute left-1/2 top-1/2 z-20 -translate-x-[40%] -translate-y-[40%]'
							}
						>
							<CardDemo
								src={'/assets/Maquilleuse_Professionnelle.webp'}
								heart={true}
							/>
						</div>
						<div
							className={
								'absolute left-1/2 top-1/2 z-10 -translate-x-[90%] -translate-y-[90%]'
							}
						>
							<CardDemo src={'/assets/Maquilleuse_cinema.webp'} heart={false} />
						</div>
					</div>
					<div className={'grid w-4/5 grid-cols-4 gap-8'}>
						{TalentList.map((talent, index) => (
							<a
								key={talent.name}
								href={'/' + convertStringToKebabCase(talent.name)}
								className={'group relative'}
							>
								<h2
									className={
										'flex h-full min-h-[120px] items-center justify-center rounded-xl border border-indigo-900/10 px-4 py-8 text-center font-semibold text-slate-900/70 transition duration-100 ease-in  group-hover:opacity-0'
									}
								>
									{talent.name}
								</h2>
								<h2
									className={
										'absolute left-0 top-0 h-full w-full border border-indigo-900 bg-indigo-900 px-4 py-8 transition duration-100 ease-in ' +
										'-z-10 flex items-center justify-center rounded-xl text-center font-semibold text-slate-50 opacity-0 group-hover:z-10 group-hover:opacity-100'
									}
								>
									Voir tous les talents
								</h2>
							</a>
						))}
					</div>
				</div>
			</div>
		</section>
	)
}

export default Talents

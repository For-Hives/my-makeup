import React from 'react'
import Image from 'next/image'
import { FireIcon } from '@heroicons/react/24/outline'
import { StarIcon, HeartIcon } from '@heroicons/react/20/solid'

function CardDemo(props) {
	return (
		<div
			className={
				'relative flex h-auto w-[200px] flex-col gap-2 rounded-xl bg-white pb-4 shadow-2xl'
			}
		>
			<div className={'relative h-[150px]'}>
				<Image
					src={props.src}
					fill={true}
					className={'rounded-t-xl object-cover'}
					alt={'Trouver votre maquilleuse professionnelle'}
				/>
			</div>
			{/* if heart is true */}
			{props.heart ? (
				<div
					className={'absolute right-0 top-0 flex items-center justify-center'}
				>
					<HeartIcon className={'mr-2 mt-2 h-6 w-6 text-red-600'} />
				</div>
			) : null}
			<div
				className={'absolute ml-3 mt-[135px] flex items-center justify-center'}
			>
				<div
					className={
						'w-full rounded-lg bg-white px-3 text-center shadow ' +
						'flex items-center justify-center py-1 text-xs font-medium italic text-indigo-900/90'
					}
				>
					<FireIcon className={'mr-2 h-4 w-4 text-indigo-900'} />
					Super maquilleuse
				</div>
			</div>
			{/*    Square */}
			<div
				className={'mt-4 flex w-full items-center justify-center gap-1 px-4'}
			>
				<div className={'h-4 w-full rounded bg-slate-100 px-4'}></div>
			</div>
			<div className={'flex w-full items-center justify-center gap-1 px-4'}>
				<div className={'h-4 w-full rounded bg-slate-100 px-4'}></div>
				<div className={'h-4 w-full rounded bg-slate-100 px-4'}></div>
				<div className={'h-4 w-full rounded bg-slate-100 px-4'}></div>
			</div>
			<div className={'flex w-full items-center justify-center gap-1 px-4'}>
				<div className={'h-4 w-full rounded bg-slate-100 px-4'}></div>
				<div className={'flex h-4 w-full items-center justify-end rounded'}>
					{/* stars in css & html */}
					<StarIcon className="h-4 w-4 text-yellow-500/90" aria-hidden="true" />
					<StarIcon className="h-4 w-4 text-yellow-500/90" aria-hidden="true" />
					<StarIcon className="h-4 w-4 text-yellow-500/90" aria-hidden="true" />
					<StarIcon className="h-4 w-4 text-yellow-500/90" aria-hidden="true" />
					<StarIcon className="h-4 w-4 text-yellow-500/90" aria-hidden="true" />
				</div>
			</div>
		</div>
	)
}

export default CardDemo

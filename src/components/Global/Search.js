import React from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/20/solid';
import { MapPinIcon } from '@heroicons/react/24/outline';

function Search(props) {
	return (
		<div
			className={
				'px-12 py-8 shadow-2xl w-full max-w-7xl bg-white rounded-2xl mb-20 flex justify-between'
			}
		>
			<div className={'flex items-center gap-6'}>
				<div className={'relative'}>
					<MagnifyingGlassIcon
						className="absolute top-1/2 left-4 transform -translate-y-1/2 h-5 w-5 text-indigo-900"
						aria-hidden="true"
					/>
					<input
						className={
							'text-sm leading-6 bg-transparent text-indigo-900 pl-12 pr-6 py-2 rounded-lg border-2 border-indigo-900 flex items-center w-80'
						}
						placeholder={
							"Essayez 'Maquilleuse mariée', 'Maquilleuse événements'..."
						}
					/>
				</div>
				<div className={'relative'}>
					<MapPinIcon
						className="absolute top-1/2 left-4 transform -translate-y-1/2 h-5 w-5 text-indigo-900"
						aria-hidden="true"
					/>
					<input
						className={
							'text-sm leading-6 bg-transparent text-indigo-900 pl-12 pr-6 py-2 rounded-lg border-2 border-indigo-900 flex items-center w-80'
						}
						placeholder={'Lieu de la mission (ex: Paris, Lyon, Marseille...)'}
					/>
				</div>
			</div>
			<div className={'flex justify-end items-center gap-6'}>
				<a
					href="/recrutement"
					className={
						'text-sm font-bold leading-6 bg-indigo-900 text-white px-4 py-2 rounded-lg border-2 border-indigo-900'
					}
				>
					Trouver une maquilleuse
				</a>
				<div className={'flex justify-center items-center'}>ou</div>
				<a href="/deposer-un-projet" className="">
					<span
						className={
							'text-sm font-bold leading-6 text-indigo-900 border-b-2 border-indigo-900'
						}
					>
						Déposer un projet
					</span>
				</a>
			</div>
		</div>
	);
}

export default Search;

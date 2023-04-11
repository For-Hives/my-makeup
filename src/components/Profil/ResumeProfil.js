import React from 'react';
import Image from 'next/image';
import { Stars } from '@/components/Profil/Stars';

// Head : General
// left
// - Photo principale
// middle
// - Nom Prénom
// - Spécialité principale
// - Ville principale et rayon d'action
// - Nombre de missions réalisées
// - Note moyenne ( avis google + avis internes , moyenne entre les deux ou un truc du genre )
// - Nombre de recommandations
// Head : infos complémentaires
// right
// - Badge de disponibilité
// - Date de disponibilité
// - Boutton d'édition de la disponibilité

function ResumeProfil(props) {
	const [starsToDisplay, setStarsToDisplay] = React.useState(5);

	return (
		<div className="mx-auto max-w-7xl pt-[90px]">
			<div className={'grid grid-cols-12 pt-[100px] gap-5'}>
				<div className={'col-span-2 flex items-center'}>
					<Image
						src={'/assets/pp_makeup_2.png'}
						alt={'ppmakeup'}
						width={500}
						height={500}
						className={'object-cover rounded-full w-[200px] h-[200px]'}
					></Image>
				</div>
				<div className={'col-span-8 flex items-center'}>
					<div className={'pl-20 w-full h-full flex flex-col gap-4'}>
						<div className={'w-full flex flex-col gap-2'}>
							<h3
								className={'font-bold tracking-tight text-slate-800 text-3xl'}
							>
								{/* todo : Nom prénom */}
								{'Nom prénom'}
							</h3>
							<h2
								className={
									'font-semibold tracking-tight text-slate-700 text-xl'
								}
							>
								{/* todo : Maquilleuse poste */}
								{'Spécialité de maquilleuse principale'}
							</h2>
						</div>
						<div>
							<div className={'flex items-center'}>
								<span className="material-symbols-rounded text-indigo-900">
									directions_run
								</span>
								peut se déplacer à {'[ville]'} & dans un rayon de {'50km'}
							</div>
							<div className={'flex items-center gap-4'}>
								<div className={'font-semibold text-sm'}>
									{'12'} missions réalisées
								</div>

								<div
									className={
										'flex items-center italic text-xs text-indigo-900/50'
									}
								></div>
							</div>
						</div>
						<div className={'flex gap-4 flex-row items-center'}>
							<Stars starsToDisplay={starsToDisplay} />{' '}
							<span className={'italic text-sm'}>( 5 avis )</span>
						</div>
					</div>
				</div>
				<div className={'col-span-2 flex items-center'}>
					<div
						className={
							'w-full h-full flex flex-col justify-between items-center'
						}
					>
						<div className={'flex flex-col gap-5'}>
							<div className={'bg-purple-600 px-4 py-2'}>badge dispo</div>
							<div>date dispo</div>
							<button>Editer ma disponibilité</button>
						</div>
						<div>
							<a href="#">
								<span>eye</span>Voir mon profil public
							</a>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

export default ResumeProfil;

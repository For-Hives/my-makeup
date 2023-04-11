import React from 'react';

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

// Cat : Partager votre profil :
// - Influence ( tous les réseaux sociaux, sites web ajoutable, chaine youtube etc )
// - Langues

// Cat : Localisation et déplacement
// - Ville principale
// - Rayon d'action
// - Les frais kilométriques

// Cat : Vos compétences
// - Liste de compétences, spécialité, possibilité

// Principal
// - Description en quelques mots ( 2000 caractères maximums )
// - Les prestations proposées
// 		- Nom
// 		- Description
// 		- Tarif + type de tarification ( Heure / jour / Package ) // Sur devis // Tarif dégressif en fonction des heures
// 		- Option supplémentaire (liste possible)
// 				- Nom
// 				- description
// 		- Prix
// - Portefolio (galerie de photos)
// - Expérience
// 		- Nom de la société / personne qui a embauché
// 		- titre de l'expérience
// 		- Ville où ça a eu lieu
// 		- Date
// 		- Description
// 		- compétences mise en oeuvre
// - Les formations suivies
// - Diplome
// - Ecole
// 		- Année d'obtention
// 		- Contenu de la formation
//

function ResumeProfil(props) {
	return (
		<div className="mx-auto max-w-7xl pt-[90px]">
			<div className={'grid grid-cols-12'}>
				<div className={'col-span-2 flex items-center'}>image</div>
				<div className={'col-span-8 flex items-center'}>
					<div className={'w-full h-full flex flex-col'}>
						<h3 className={'font-bold tracking-tight text-slate-900 text-3xl'}>
							Nom prénom
						</h3>
						<h2>Spécialité</h2>
						<div>
							<div>
								<span>people</span> peut se déplacer à [villes]
							</div>
							<div>
								nombre de missions réalisées : <span>0</span>
							</div>
						</div>
						<div>
							<div>
								<span>star</span> note moyenne : <span>5</span>
							</div>
							<div>
								<span>Thumbs</span> nombre de recommandations : <span>10</span>
							</div>
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

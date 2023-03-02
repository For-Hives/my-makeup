import React from 'react';

function Collaboration(props) {
    return (<section className={"relative py-20 flex flex-col gap-10"}>
        <div className="mx-auto max-w-7xl">
            <div className="mx-auto">
                <h2 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-4xl text-center">
                    Vous allez adorer cette nouvelle façon de collaborer
                </h2>
            </div>
        </div>
        <div className="mx-auto max-w-7xl">
            <div className="mx-auto flex w-full">
                <div className={"w-2/5 flex flex-col justify-center items-start h-auto relative mt-10 gap-8"}>
                    <h3 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-3xl text-center">
                        Boostez votre activité
                    </h3>
                    <div className={"flex flex-col gap-4"}>
                        <p>
                            Vous cherchez à vous épanouir dans votre carrière de maquilleuse professionnelle ?
                            Ne cherchez plus, My Makeup est la solution idéale pour vous !
                        </p>
                        <p>
                            Avec My Makeup, vous pouvez recevoir des offres de missions parfaitement adaptées à
                            vos compétences et communiquer directement avec des clients
                            potentiels dans tous les secteurs.
                        </p>
                        <p>
                            Cerise sur le gâteau, notre équipe dédiée aux maquilleuses vous accompagne
                            avec des ressources spécialisées, des partenariats, et des événements pour vous
                            aider à développer votre carrière de manière optimale.
                        </p>
                    </div>
                    <div>
                        <a href="/signup" className={"text-sm font-bold leading-6 bg-indigo-900 text-white px-4 py-2 rounded-lg border-2 border-indigo-900"}>
                            Rejoindre la communauté
                        </a>
                    </div>
                </div>
                <div className={"w-3/5 grid grid-cols-4 gap-8"}>

                </div>
            </div>
        </div>
        <div className="mx-auto max-w-7xl">
            <div className="mx-auto flex w-full">
                <div className={"w-3/5 grid grid-cols-4 gap-8"}>

                </div>
                <div className={"w-2/5 flex flex-col justify-center items-start h-auto relative mt-10 gap-8"}>
                    <h3 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-3xl text-center">
                        Pour toutes & tous !
                    </h3>
                    <div className={"flex flex-col gap-4"}>
                        <p>
                            Vous êtes spécialisée en maquillage pour les mariées ou en maquillage artistique ? Vous
                            cherchez à travailler à Lyon, Nantes, Toulouse, Rennes, Lille,
                            Cannes ou Paris ? Pas de problème ! Avec My Makeup, les gens qui en on besoin peuvent vous trouver
                            facilement.
                        </p>
                        <p>
                            N&apos;attendez plus pour rejoindre la communauté de maquilleuses professionnelles de My Makeup.
                            Avec notre plateforme, vous pouvez trouver des missions
                            passionnantes et des clients fidèles qui vous permettront de développer votre carrière à votre guise.
                            Inscrivez-vous dès maintenant et commencez à
                            construire votre avenir professionnel dès aujourd&apos;hui !
                        </p>
                    </div>
                </div>

            </div>
        </div>
    </section>);
}

export default Collaboration;

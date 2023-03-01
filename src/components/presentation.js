import React from 'react';
import Image from 'next/image';

function Presentation(props) {
    return (
        <section className={"relative bg-white mt-20"}>
            <div className="mx-auto max-w-7xl">
                <div className="mx-auto">
                    <h2 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-4xl text-center">
                        My Makeup c&apos;est avant tout une communauté
                    </h2>
                    <p className="mt-6 text-lg leading-8 text-slate-700 text-center">
                        Où les maquilleuses et les particuliers se retrouvent pour collaborer en tout simplicité.
                    </p>
                </div>
            </div>
            <div className={"mx-auto max-w-7xl mt-8"}>
                <div className={"mx-auto flex justify-center items-center gap-32"}>
                    <div className={"flex items-center justify-center flex-col"}>
                        <Image alt={"client à la recherche de maquilleuse"} src={"/assets/vectorials-used/004-deal.svg"} width={"140"} height={"140"}/>
                        <h3 className={"text-4xl font-bold tracking-tight text-slate-700 sm:text-xl text-center"}>Des milliers de particuliers</h3>
                        <p className={"text-sm leading-8 text-slate-600 text-center"}>À la recherche de maquilleuses expérimentées</p>
                    </div>
                    <div className={"flex items-center justify-center flex-col"}>
                        <Image alt={"des maquilleuses passionnées aux multiples compétences"} src={"/assets/vectorials-used/008-increase.svg"} width={"140"} height={"140"}/>
                        <h3 className={"text-4xl font-bold tracking-tight text-slate-700 sm:text-xl text-center"}>Des milliers de maquilleuses</h3>
                        <p className={"text-sm leading-8 text-slate-600 text-center"}>Aux multiples spécialités et personnalités</p>
                    </div>
                    <div className={"flex items-center justify-center flex-col"}>
                        <Image alt={"une solution dédiée pour collaborer entre particuliers et maquilleuses"} src={"/assets/vectorials-used/013-presentation.svg"} width={"140"} height={"140"}/>
                        <h3 className={"text-4xl font-bold tracking-tight text-slate-700 sm:text-xl text-center"}>1 solution dédiée</h3>
                        <p className={"text-sm leading-8 text-slate-600 text-center"}>Pensée et conçue pour collaborer</p>
                    </div>
                </div>
            </div>
        </section>
    );
}

export default Presentation;

import React from 'react';
import CardDemo from "@/components/Global/Card-demo";

const TalentList = [
    {
        name: "Maquillage mariée"
    },
    {
        name: "Maquillage soirée"
    },
    {
        name: "Maquillage professionnel"
    },
    {
        name: "Maquillage enfant"
    },
    {
        name: "Maquillage spécialisé"
    },
    {
        name: "Maquillage homme"
    },
    {
        name: "Maquillage femme"
    },
    {
        name: "Maquillage de fête"
    },
    {
        name: "Maquillage de soirée"
    },
    {
        name: "Maquillage de film"
    },
    {
        name: "Maquillage de théâtre"
    },
    {
        name: "Maquillage FX"
    },
    {
        name: "Maquillage beauté"
    },
    {
        name: "Maquillage artistique"
    },
    {
        name: "Maquillage cinéma"
    },
];

function Talents(props) {
    return (
        <section className={"relative py-20"}>
            <div className="mx-auto max-w-7xl py-10">
                <div className="mx-auto">
                    <h2 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-4xl text-right">
                        Vos projets, nos meilleurs talents.
                    </h2>
                </div>
            </div>
            <div className="mx-auto max-w-7xl">
                <div className="mx-auto flex w-full gap-24">
                    <div className={"w-1/5 flex justify-center items-center h-auto relative"}>
                        <div className={"absolute top-1/2 left-1/2 -translate-x-[40%] -translate-y-[40%] z-20"}>
                            <CardDemo src={"/assets/Maquilleuse_Professionnelle.jpg"} heart={true}/>
                        </div>
                        <div className={"absolute top-1/2 left-1/2 -translate-x-[90%] -translate-y-[90%] z-10"}>
                            <CardDemo src={"/assets/Maquilleuse_cinema.webp"} heart={false}/>
                        </div>
                    </div>
                    <div className={"w-4/5 grid grid-cols-4 gap-8"}>
                        {TalentList.map((talent, index) => (
                            <a key={talent.name} href={"/" + talent.name} className={"group relative"}>
                                <h2 className={"transition ease-in duration-100 min-h-[120px] h-full py-8 px-4 border border-indigo-900/10 rounded-xl flex items-center justify-center font-semibold text-slate-900/70 group-hover:opacity-0  text-center"}>
                                    {talent.name}
                                </h2>
                                <h2 className={"absolute top-0 left-0 h-full w-full transition ease-in duration-100 py-8 px-4 border border-indigo-900 bg-indigo-900 " +
                                    "rounded-xl flex items-center justify-center font-semibold text-slate-50 opacity-0 -z-10 group-hover:opacity-100 group-hover:z-10 text-center"}>
                                    Voir tous les talents
                                </h2>
                            </a>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}

export default Talents;

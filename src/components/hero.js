import Image from "next/image"
import {MagnifyingGlassIcon} from "@heroicons/react/20/solid";
import {MapPinIcon} from "@heroicons/react/24/outline";


export default function Hero() {

    return (
        <div className="relative bg-white">
            <div className={"absolute bottom-0 left-1/2 transform -translate-x-1/2 z-20 flex justify-center items-end w-full"}>
                <div className={"px-12 py-8 shadow-2xl w-full max-w-7xl bg-white rounded-2xl mb-20 flex justify-between"}>
                    <div className={"flex items-center gap-6"}>
                        <div className={"relative"}>
                            <MagnifyingGlassIcon className="absolute top-1/2 left-4 transform -translate-y-1/2 h-5 w-5 text-indigo-900" aria-hidden="true"/>
                            <input className={"text-sm leading-6 bg-transparent text-indigo-900 pl-12 pr-6 py-2 rounded-lg border-2 border-indigo-900 flex items-center w-80"}
                                   placeholder={"Essayez 'Maquilleuse mariée', 'Maquilleuse événements'..."}
                            />
                        </div>
                        <div className={"relative"}>
                            <MapPinIcon className="absolute top-1/2 left-4 transform -translate-y-1/2 h-5 w-5 text-indigo-900" aria-hidden="true"/>
                            <input className={"text-sm leading-6 bg-transparent text-indigo-900 pl-12 pr-6 py-2 rounded-lg border-2 border-indigo-900 flex items-center w-80"}
                                   placeholder={"Lieu de la mission (ex: Paris, Lyon, Marseille...)"}
                            />
                        </div>
                    </div>
                    <div className={"flex justify-end items-center gap-6"}>
                        <a href="/signup" className={"text-sm font-bold leading-6 bg-indigo-900 text-white px-4 py-2 rounded-lg border-2 border-indigo-900"}>
                            Créer mon compte
                        </a>
                        <div className={"flex justify-center items-center"}>
                            ou
                        </div>
                        <a href="#" className="">
                            <span className={"text-sm font-bold leading-6 text-indigo-900 border-b-2 border-indigo-900"}>Me connecter</span>
                        </a>
                    </div>
                </div>
            </div>
            <div className="mx-auto max-w-7xl">
                <div className="relative z-10 lg:w-full lg:max-w-2xl">
                    <svg
                        className="absolute inset-y-0 right-8 hidden h-full w-full translate-x-1/2 transform fill-white lg:block"
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        aria-hidden="true"
                    >
                        <polygon points="0,0 90,0 50,100 0,100"/>
                    </svg>
                    <div className="relative py-32 px-6 sm:py-40 lg:pt-52 lg:pb-80 lg:px-8 lg:pr-0 z-10">
                        <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-xl">
                            <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
                                Trouvez la maquilleuse qui vous correspond n&apos;a jamais été aussi simple
                            </h1>
                            <p className="mt-6 text-lg leading-8 text-slate-700">
                                Trouvez la maquilleuse spécialisée dans le domaine que vous recherchez, maquillage pour les mariées,
                                maquillage de soirée, maquillage professionnel...
                            </p>
                        </div>
                    </div>
                </div>
            </div>
            <div className="bg-white lg:absolute lg:inset-y-0 lg:right-0 lg:w-1/2">
                <Image
                    className="aspect-[3/2] object-cover lg:aspect-auto lg:h-full lg:w-full "
                    width={1000}
                    height={1000}
                    src="/assets/back.png"
                    alt="trouver une maquilleuse professionnelle freelance"
                />
            </div>
        </div>
    )
}

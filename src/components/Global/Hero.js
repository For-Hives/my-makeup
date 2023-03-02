import Image from "next/image"
import Search from "@/components/Global/Search";


export default function Hero() {

    return (
        <div className="relative bg-white">
            <div className={"absolute bottom-0 left-1/2 transform -translate-x-1/2 z-20 flex justify-center items-end w-full"}>
                <Search/>
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
                                Trouver la maquilleuse qui vous correspond n&apos;a jamais été aussi simple
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

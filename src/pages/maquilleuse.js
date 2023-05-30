import Head                from 'next/head'
import Image               from 'next/image'
import SearchBloc          from '@/components/Global/SearchBloc'
import { CheckCircleIcon } from '@heroicons/react/24/outline';
import Nav                 from '@/components/Global/Nav';
import Footer              from '@/components/Global/Footer';

/**
 * todo : add content
 * @param props
 * @constructor
 */
function PourquoiMyMakeup() {

    const advantages = [
        {
            title: 'Développez votre activité',
            description: 'Trouvez de nouveaux clients, améliorez votre visibilité et développez votre activité avec My Makeup. Nous vous aidons à atteindre votre plein potentiel.',
            icon: <CheckCircleIcon className="h-6 w-6 text-green-500"/>
        },
        {
            title: 'Évaluez votre travail',
            description: 'Notre système de notation vous donne l\'opportunité de recevoir des retours constructifs de vos clients. Utilisez ces évaluations pour améliorer constamment la qualité de vos services et gagner encore plus la confiance de vos futurs clients.',
            icon: <CheckCircleIcon className="h-6 w-6 text-green-500"/>
        },
        {
            title: 'Mettez en avant vos compétences et votre parcours',
            description: 'My Makeup met en lumière votre unique parcours et compétences. Notre système de recherche avancé permet aux clients de vous trouver en fonction de vos spécialités, de votre expérience et de votre formation. Montrez au monde ce qui fait de vous une maquilleuse exceptionnelle.',
            icon: <CheckCircleIcon className="h-6 w-6 text-green-500"/>
        },
        {
            title: 'Définissez vos tarifs',
            description: 'Chez My Makeup, vous avez le contrôle total sur vos tarifs. Fixez le prix que vous estimez juste pour vos prestations. Nous respectons le travail et la créativité de nos maquilleuses et nous croyons en une rémunération équitable.',
            icon: <CheckCircleIcon className="h-6 w-6 text-green-500"/>
        },
        {
            title: 'Profitez d\'un service totalement gratuit',
            description: 'My Makeup est un service totalement gratuit pour les maquilleuses. Notre objectif est de vous aider à développer votre activité sans frais supplémentaires. Nous croyons au potentiel des maquilleuses professionnelles et nous sommes là pour soutenir votre croissance.',
            icon: <CheckCircleIcon className="h-6 w-6 text-green-500"/>
        },
        {
            title: 'Facilité d\'utilisation',
            description: 'Notre plateforme est conçue pour être intuitive et facile à utiliser, ce qui vous permet de vous concentrer sur ce que vous faites le mieux : le maquillage.',
            icon: <CheckCircleIcon className="h-6 w-6 text-green-500"/>
        },
        {
            title: 'Choix varié',
            description: 'Rejoignez une communauté diversifiée de maquilleuses professionnelles. Profitez de l\'occasion pour échanger des idées et des techniques.',
            icon: <CheckCircleIcon className="h-6 w-6 text-green-500"/>
        },
        {
            title: 'Paiement sécurisé',
            description: 'Recevez des paiements en toute sécurité via notre système de paiement sécurisé. Nous nous occupons des transactions pour que vous puissiez vous concentrer sur vos clients.',
            icon: <CheckCircleIcon className="h-6 w-6 text-green-500"/>
        },
        {
            title: 'Publicité gratuite',
            description: 'En rejoignant notre plateforme, vous bénéficiez d\'une publicité gratuite pour votre travail. Profitez de l\'exposition à une base de clients plus large.',
            icon: <CheckCircleIcon className="h-6 w-6 text-green-500"/>
        },
        {
            title: 'Flexibilité',
            description: 'Travaillez à votre rythme et selon vos propres horaires. Avec My Makeup, vous pouvez gérer vos rendez-vous en fonction de vos disponibilités.',
            icon: <CheckCircleIcon className="h-6 w-6 text-green-500"/>
        },
        {
            title: 'Cote de popularité',
            description: "Profitez de notre système de notation et d'évaluation pour mettre en valeur la qualité de votre travail et attirer plus de clients.",
            icon: <CheckCircleIcon className="h-6 w-6 text-green-500"/>
        }
    ]

    return (
        <>
            <Head>
                <title>Pourquoi My Makeup ?</title>
                <meta
                    name="description"
                    content="Découvrez pourquoi vous devriez rejoindre My Makeup en tant que maquilleuse professionnelle"
                />
            </Head>

            <Nav/>

            <main>
                <section className="relative bg-white pt-[90px]">
                    <div
                        className={
                            'absolute bottom-0 left-1/2 z-20 flex w-full -translate-x-1/2 transform items-end justify-center'
                        }
                    >
                        <SearchBloc/>
                    </div>
                    <div className="mx-auto max-w-7xl">
                        <div className="relative z-10 lg:w-full lg:max-w-2xl">
                            <div className="relative z-10 px-6 py-32 sm:py-40 lg:px-8 lg:pb-80 lg:pr-0 lg:pt-52">
                                <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-xl">
                                    <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
                                        Pourquoi rejoindre My Makeup en tant que maquilleuse professionnelle ?
                                    </h1>
                                    <p className="mt-6 text-lg leading-8 text-slate-700">
                                        Découvrez les avantages à rejoindre notre communauté pour développer votre
                                        activité et atteindre une nouvelle clientèle.
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
                            alt="maquilleuse professionnelle"
                        />
                    </div>
                </section>

                <section className="bg-white">
                    <div className="bg-white py-16 px-4 overflow-hidden sm:px-6 lg:px-8 lg:py-24">
                        <div className="relative max-w-screen-2xl mx-auto">
                            <div className="text-center">
                                <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
                                    Nos Avantages
                                </h2>
                                <p className="mt-4 text-lg leading-6 text-gray-500">
                                    Pourquoi choisir My Makeup ? Voici quelques-uns de nos avantages.
                                </p>
                            </div>
                            <div className="mt-12">
                                <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 ">
                                    {advantages.map((advantage) => (
                                        <div key={advantage.title} className="pt-6">

                                            <div className="flow-root bg-gray-50 rounded-lg px-6 pb-8">
                                                <div className="mt-6">

                                                    <div className={"flex items-center align-middle"}>
                                                    <h3 className="mt-8 text-lg font-medium text-gray-900 tracking-tight">{advantage.title}</h3>

                                                         <span className="inline-block p-3 rounded-md ">
                                                            {advantage.icon}
                                                         </span>
                                                    </div>
                                                    <p className="mt-5 text-base text-gray-500">
                                                        {advantage.description}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="text-center m-12 ">
                        <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
                            Rejoignez la communauté My Makeup
                        </button>

                    </div>
                </section>

            </main>

            <Footer/>
        </>
    )
}

export default PourquoiMyMakeup

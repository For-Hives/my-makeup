import React, {useState} from 'react';
import {Bars3Icon, XMarkIcon} from "@heroicons/react/24/outline";
import {Dialog} from "@headlessui/react";

const navigation = [
    {
        name: 'Particulier', href: '/particulier', mode: 'dropdown', children: [
            {
                name: 'Pourquoi My Makeup ?', href: '/particulier', icon: 'handshake',
                description: 'My Makeup est une plateforme de mise en relation entre les particuliers et les professionnels de la beauté.'
            },
            {
                name: 'Trouver des maquilleuses', href: '/particulier/trouver-une-maquilleuse', icon: 'diversity_1',
                description: 'Trouvez la maquilleuse qui vous correspond parmi les profils disponibles.'
            },
            {
                name: 'Centraliser ses recherches',
                href: '/particulier/centraliser-ses-recherches',
                icon: 'query_stats',
                description: 'Centralisez vos recherches pour comparer et trouver la maquilleuse qui vous correspond.'
            },
            {
                name: 'Explorer les profils', href: '/particulier/explorer-les-profils', icon: 'person_search',
                description: 'Cherchez par critères et par villes !'
            }
        ]
    },
    {
        name: 'Maquilleuse', href: '/maquilleuse', mode: 'dropdown', children: [
            {
                name: 'Pourquoi My Makeup ?', href: '/maquilleuse', icon: 'brush',
                description: 'Rejoignez la communauté My Makeup pour développer votre activité, trouver de nouveaux clients,' +
                    ' gagner en visibilité. Et facilité votre gestion quotidienne !'
            },
            {
                name: "Community & Partenariats", href: '/maquilleuse/partenariats', icon: 'group',
                description: 'Nous sommes là pour vous accompagner dans votre développement !'
            },
            {
                name: 'Nos partenaires', href: '/maquilleuse/partenaires', icon: 'social_leaderboard',
                description: 'Utilisez les outils de nos partenaires pour développer votre activité ! ' +
                    'Et Facilitez votre vie !'
            }
        ]
    },
    {
        name: 'Solutions', href: '/solutions', mode: 'dropdown', children: [
            {
                name: 'Pour les particuliers', href: '/solutions/pour-les-particuliers', icon: 'groups',
                description: 'Trouvez la maquilleuse de vos rêves, n\'a jamais été aussi simple !'
            },
            {
                name: 'Pour les maquilleuses', href: '/solutions/pour-les-maquilleuses', icon: 'diversity_2',
                description: 'Le seul endroit pour trouver des clients, développer votre activité et trouver des opportunités !'
            }
        ]
    },
    {name: 'Blog', href: '/blog'},
    {name: 'Trouvez une maquilleuse', href: '#', mode: 'search'},
    {name: 'Créer mon compte', href: '/signup', mode: 'signup'},
    {name: 'Me connecter', href: '/login', mode: 'login'},
]

function Nav(props) {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    return (
        <>
            <div className="relative bg-white">
                <div className="mx-auto max-w-7xl">
                    <div className="relative z-10 lg:w-full lg:max-w-7xl">
                        <div className="relative px-6 pt-6 lg:pl-8 lg:pr-0">
                            <nav className="flex items-center justify-between sm:h-10 lg:justify-start"
                                 aria-label="Global">
                                <a href="#" className="-m-1.5 p-1.5">
                                    <span className="sr-only">My Makeup</span>
                                    <img
                                        alt="Your Company"
                                        className="h-8 w-auto"
                                        src="https://tailwindui.com/img/logos/mark.svg?color=indigo&shade=600"
                                    />
                                </a>
                                <button
                                    type="button"
                                    className="-m-2.5 rounded-md p-2.5 text-gray-700 lg:hidden"
                                    onClick={() => setMobileMenuOpen(true)}
                                >
                                    <span className="sr-only">Ouvrir le menu</span>
                                    <Bars3Icon className="h-6 w-6" aria-hidden="true"/>
                                </button>
                                <div className="hidden lg:block lg:gap-10 flex w-full justify-between">
                                    {navigation.map((item) => (
                                        <a key={item.name} href={item.href}
                                           className="text-sm font-semibold leading-6 text-gray-900">
                                            {item.name}
                                        </a>
                                    ))}
                                </div>
                            </nav>
                            <Dialog as="div" open={mobileMenuOpen} onClose={setMobileMenuOpen}>
                                <Dialog.Panel
                                    className="fixed inset-0 z-10 overflow-y-auto bg-white px-6 py-6 lg:hidden">
                                    <div className="flex flex-row-reverse items-center justify-between">
                                        <button
                                            type="button"
                                            className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-gray-700"
                                            onClick={() => setMobileMenuOpen(false)}
                                        >
                                            <span className="sr-only">Close menu</span>
                                            <XMarkIcon className="h-6 w-6" aria-hidden="true"/>
                                        </button>
                                        <a href="#" className="-m-1.5 p-1.5">
                                            <span className="sr-only">Your Company</span>
                                            <img
                                                className="h-8"
                                                src="https://tailwindui.com/img/logos/mark.svg?color=indigo&shade=600"
                                                alt=""
                                            />
                                        </a>
                                    </div>
                                    <div className="mt-6 space-y-2">
                                        {navigation.map((item) => (
                                            <a
                                                key={item.name}
                                                href={item.href}
                                                className="-mx-3 block rounded-lg py-2 px-3 text-base font-semibold leading-7 text-gray-900 hover:bg-gray-400/10"
                                            >
                                                {item.name}
                                            </a>
                                        ))}
                                    </div>
                                </Dialog.Panel>
                            </Dialog>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

export default Nav;
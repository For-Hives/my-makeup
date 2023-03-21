import React, {useState} from 'react';
import {Bars3Icon, XMarkIcon} from "@heroicons/react/24/outline";
import {Dialog} from "@headlessui/react";
import {MagnifyingGlassIcon} from "@heroicons/react/20/solid";
import Image from "next/image"
import PopoverComponent from "@/components/Global/Popover";

const navigation = [{
    name: 'Particulier', href: '/particulier', mode: 'dropdown', children: [{
        name: 'Pourquoi My Makeup ?',
        href: '/particulier',
        icon: 'handshake',
        description: 'My Makeup est une plateforme de mise en relation entre les particuliers et les professionnels de la beauté.'
    }, {
        name: 'Trouver des maquilleuses',
        href: '/particulier/trouver-une-maquilleuse',
        icon: 'diversity_1',
        description: 'Trouvez la maquilleuse qui vous correspond parmi les profils disponibles.'
    }, {
        name: 'Centraliser ses recherches',
        href: '/particulier/centraliser-ses-recherches',
        icon: 'query_stats',
        description: 'Centralisez vos recherches pour comparer et trouver la maquilleuse qui vous correspond.'
    }, {
        name: 'Explorer les profils', href: '/particulier/explorer-les-profils', icon: 'person_search', description: 'Cherchez par critères et par villes !'
    }]
}, {
    name: 'Maquilleuse', href: '/maquilleuse', mode: 'dropdown', children: [{
        name: 'Pourquoi My Makeup ?',
        href: '/maquilleuse',
        icon: 'brush',
        description: 'Rejoignez la communauté My Makeup pour développer votre activité, trouver de nouveaux clients,' + ' gagner en visibilité. Et facilité votre gestion quotidienne !'
    }, {
        name: "Community & Partenariats", href: '/maquilleuse/partenariats', icon: 'group', description: 'Nous sommes là pour vous accompagner dans votre développement !'
    }, {
        name: 'Nos partenaires',
        href: '/maquilleuse/partenaires',
        icon: 'social_leaderboard',
        description: 'Utilisez les outils de nos partenaires pour développer votre activité ! ' + 'Et Facilitez votre vie !'
    }]
}, {
    name: 'Solutions', href: '/solutions', mode: 'dropdown', children: [{
        name: 'Pour les particuliers', href: '/solutions/pour-les-particuliers', icon: 'groups', description: 'Trouvez la maquilleuse de vos rêves, n\'a jamais été aussi simple !'
    }, {
        name: 'Pour les maquilleuses',
        href: '/solutions/pour-les-maquilleuses',
        icon: 'diversity_2',
        description: 'Le seul endroit pour trouver des clients, développer votre activité et trouver des opportunités !'
    }]
}, {
    name: 'Blog', href: '/blog'
}, // {name: 'Trouvez une maquilleuse', href: '#', mode: 'search', side:'right'},
    // {name: 'Créer mon compte', href: '/signup', mode: 'signup', side:'right'},
    // {name: 'Me connecter', href: '/login', mode: 'login', side:'right'},
]

function Nav(props) {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    return (<>
        <div className="fixed top-0 left-0 w-full bg-white z-30 h-[90px] flex items-center justify-center">
            <div className="mx-auto w-full h-full">
                <div className="relative z-20 lg:w-full">
                    <div className="relative px-6 py-6 lg:px-16 lg:border-b lg:border-slate-300">
                        <nav className="flex items-center justify-between sm:h-10 lg:justify-start"
                             aria-label="Global">
                            <a href="src/components#" className="-m-1.5 p-1.5">
                                <span className="sr-only">My Makeup</span>
                                <Image
                                    alt="Logo My Makeup"
                                    width={50}
                                    height={50}
                                    src="/assets/logo_2.webp"
                                />
                            </a>
                            <button
                                type="button"
                                className="-m-2.5 rounded-md p-2.5 text-slate-900 lg:hidden"
                                onClick={() => setMobileMenuOpen(true)}
                            >
                                <span className="sr-only">Ouvrir le menu</span>
                                <Bars3Icon className="h-6 w-6" aria-hidden="true"/>
                            </button>
                            <div className="hidden lg:ml-10 lg:flex lg:w-full lg:justify-between">
                                <div className={"lg:gap-10 lg:flex lg:w-full lg:items-center"}>
                                    {navigation.map((item) => {
                                        if (item.mode === 'dropdown') {
                                            return (<PopoverComponent key={item.name} name={item.name} translate={"30%"} content={item.children}/>)
                                        } else {
                                            return (<a key={item.name} href={item.href}
                                                       className="text-sm font-semibold leading-6 text-slate-900">
                                                {item.name}
                                            </a>)
                                        }
                                    })}
                                </div>
                                <div className={"lg:gap-10 lg:flex lg:w-full lg:justify-end lg:items-center"}>
                                    <button className={"text-sm leading-6 bg-transparent text-indigo-900 px-4 py-2 rounded-lg border-2 border-indigo-900 flex items-center"}>
                                        <MagnifyingGlassIcon className="mr-2 h-5 w-5 text-indigo-900" aria-hidden="true"/>
                                        Trouver une maquilleuse
                                    </button>
                                    <a href="/signup" className={"text-sm font-bold leading-6 bg-indigo-900 text-white px-4 py-2 rounded-lg border-2 border-indigo-900"}>
                                        Créer mon compte
                                    </a>
                                    <a href="src/components#" className="">
                                        <span className={"text-sm font-bold leading-6 text-indigo-900 border-b-2 border-indigo-900"}>Me connecter</span>
                                    </a>
                                </div>
                            </div>
                        </nav>
                        <Dialog as="div" open={mobileMenuOpen} onClose={setMobileMenuOpen}>
                            <Dialog.Panel
                                className="fixed inset-0 z-10 overflow-y-auto bg-white px-6 py-6 lg:hidden">
                                <div className="flex flex-row-reverse items-center justify-between">
                                    <button
                                        type="button"
                                        className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-slate-100"
                                        onClick={() => setMobileMenuOpen(false)}
                                    >
                                        <span className="sr-only">Fermer le menu</span>
                                        <XMarkIcon className="h-6 w-6" aria-hidden="true"/>
                                    </button>
                                    <a href="src/components#" className="-m-1.5 p-1.5">
                                        <span className="sr-only">My Makeup</span>
                                        <Image
                                            className="h-8"
                                            src="https://tailwindui.com/img/logos/mark.svg?color=indigo&shade=600"
                                            alt=""
                                        />
                                    </a>
                                </div>
                                <div className="mt-6 space-y-2">
                                    {navigation.map((item) => (<a
                                        key={item.name}
                                        href={item.href}
                                        className="-mx-3 block rounded-lg py-2 px-3 text-base font-semibold leading-7 text-slate-900 hover:bg-slate-400/10"
                                    >
                                        {item.name}
                                    </a>))}
                                </div>
                            </Dialog.Panel>
                        </Dialog>
                    </div>
                </div>
            </div>
        </div>
    </>);
}

export default Nav;

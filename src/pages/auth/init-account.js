import React, {useEffect, useState} from 'react'
import Head from 'next/head'
import Link from 'next/link'
import Image from 'next/image'
import {signIn, signOut, useSession} from 'next-auth/react'
import {useForm, Controller} from 'react-hook-form'
import {yupResolver} from '@hookform/resolvers/yup'
import * as yup from 'yup'
import _ from 'lodash'
import ResponsiveTemporary from '@/components/Global/ResponsiveTemporary'
import {useRouter} from 'next/router'
import {CheckIcon} from '@heroicons/react/24/outline'
import ResumeProfil from '@/components/Profil/Parents/ResumeProfil'
import {useQuery} from '@tanstack/react-query'
import Loader from '@/components/Global/Loader'

function InitAccount() {
    const [step, setStep] = useState(0)
    const [stepsList, setStepsList] = useState([{
        name: 'Verification de l\'email', href: '#', status: 'upcoming'
    }, {name: 'Initialisation du compte', href: '#', status: 'upcoming'}, {
        name: 'Nom et Prénom', href: '#', status: 'upcoming'
    }, {name: 'Finalisation', href: '#', status: 'upcoming'},])
    const [user, setUser] = useState(null)
    const [accountInit, setAccountInit] = useState(false)

    const router = useRouter()

    // get current user id
    const {data: session} = useSession()


    useEffect(() => {
        if (!session) return
        //  get user data

        if (session.user) {


            if (user === null) {
                console.log('Sessuion user', session.user)
                getUserFromSession(session).then(r => setUser(r));
            } else {

                // see if user is verified
                console.log('User', user)

                if (!user.confirmed) {
                    // if yes, 1 stepper : verify email
                    setStep(1);
                } else {
                    if (step <= 3) {

                        if (!accountInit) {

                            setStep(2);
                            // if yes, 2 stepper : init account
                            fetch(`${process.env.NEXT_PUBLIC_API_URL}api/me-makeup`, {
                                method: 'POST', headers: {
                                    // 	token
                                    'Content-Type': 'application/json',
                                    Accept: 'application/json',
                                    Authorization: `Bearer ${session.jwt}`,
                                }, body: JSON.stringify({}),
                            })
                                .then(response => {
                                    if (response.status === 200) {
                                        console.log('response', response.body)
                                    }
                                })
                                .catch(err => {
                                    console.log(err)
                                })
                            console.log('InitAccount')
                            setAccountInit(true);
                        }
                        setStep(3);
                    }
                }
            }
            // if yes, 3 stepper : name + last name
            // if yes, 4 stepper : go to profil page
        }
    }, [session, user, step])


    useEffect(() => {

        console.log('new step : ', step)

        if (step === 0) {

            setStepsList([{
                name: 'Verification de l\'email', href: '#', status: 'upcoming'
            }, {name: 'Initialisation du compte', href: '#', status: 'upcoming'}, {
                name: 'Nom et Prénom', href: '#', status: 'upcoming'
            }, {name: 'Finalisation', href: '#', status: 'upcoming'},])
        }
        if (step === 1) {

            setStepsList([{
                name: 'Verification de l\'email', href: '#', status: 'current'
            }, {name: 'Initialisation du compte', href: '#', status: 'upcoming'}, {
                name: 'Nom et Prénom', href: '#', status: 'upcoming'
            }, {name: 'Finalisation', href: '#', status: 'upcoming'},])


        }
        if (step === 2) {

            setStepsList([{
                name: 'Verification de l\'email', href: '#', status: 'complete'
            }, {name: 'Initialisation du compte', href: '#', status: 'current'}, {
                name: 'Nom et Prénom', href: '#', status: 'upcoming'
            }, {name: 'Finalisation', href: '#', status: 'upcoming'},])
        }
        if (step === 3) {

            setStepsList([{
                name: 'Verification de l\'email', href: '#', status: 'complete'
            }, {name: 'Initialisation du compte', href: '#', status: 'complete'}, {
                name: 'Nom et Prénom', href: '#', status: 'current'
            }, {name: 'Finalisation', href: '#', status: 'upcoming'},])


        }
        if (step === 4) {


            setStepsList([{
                name: 'Verification de l\'email', href: '#', status: 'complete'
            }, {name: 'Initialisation du compte', href: '#', status: 'complete'}, {
                name: 'Nom et Prénom', href: '#', status: 'complete'
            }, {name: 'Finalisation', href: '#', status: 'current'},])
        }


    }, [step])

    if (step === 0) return <Loader/>

    // if (error) return 'An error has occurred: ' + error.message
    // const user = data

    return (<>
        <Head>
            <title>My Makeup</title>
            <meta
                name="description"
                content="Inscription sur my-makeup.fr la plateforme qui va révolutionner votre
	            recherche de maquilleuses professionnelles, ou votre recherche de client !"
            />
        </Head>
        <div className="relative flex min-h-screen bg-white">
            {/*<ResponsiveTemporary />*/}

            <div
                className="container mx-auto flex flex-col items-center justify-center bg-amber-300 sm:px-6 lg:px-8">
                <div className="overflow-hidden rounded-lg bg-white shadow">
                    <div className="px-4 py-5 sm:px-6">
                        {/* Content goes here */}
                        {/* We use less vertical padding on card headers on desktop than on body sections */}

                        <nav aria-label="Progress">
                            <ol
                                role="list"
                                className="divide-y divide-gray-300 rounded-md border border-gray-300 md:flex md:divide-y-0"
                            >
                                {stepsList.map((step, stepIdx) => (
                                    <li key={step.name} className="relative md:flex md:flex-1">
                                        {step.status === 'complete' ? (<a
                                            href={step.href}
                                            className="group flex w-full items-center"
                                        >
													<span className="flex items-center px-6 py-4 text-sm font-medium">
														<span
                                                            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 group-hover:bg-indigo-800">
															<CheckIcon
                                                                className="h-6 w-6 text-white"
                                                                aria-hidden="true"
                                                            />
														</span>
														<span className="ml-4 text-sm font-medium text-gray-900">
															{step.name}
														</span>
													</span>
                                        </a>) : step.status === 'current' ? (<a
                                            href={step.href}
                                            className="flex items-center px-6 py-4 text-sm font-medium"
                                            aria-current="step"
                                        >
													<span
                                                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 border-indigo-600">
														<span className="text-indigo-600">{step.id}</span>
													</span>
                                            <span className="ml-4 text-sm font-medium text-indigo-600">
														{step.name}
													</span>
                                        </a>) : (<a href={step.href} className="group flex items-center">
													<span className="flex items-center px-6 py-4 text-sm font-medium">
														<span
                                                            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 border-gray-300 group-hover:border-gray-400">
															<span className="text-gray-500 group-hover:text-gray-900">
																{step.id}
															</span>
														</span>
														<span
                                                            className="ml-4 text-sm font-medium text-gray-500 group-hover:text-gray-900">
															{step.name}
														</span>
													</span>
                                        </a>)}
                                        {stepIdx !== stepsList.length - 1 ? (<>
                                            {/* Arrow separator for lg screens and up */}
                                            <div
                                                className="absolute right-0 top-0 hidden h-full w-5 md:block"
                                                aria-hidden="true"
                                            >
                                                <svg
                                                    className="h-full w-full text-gray-300"
                                                    viewBox="0 0 22 80"
                                                    fill="none"
                                                    preserveAspectRatio="none"
                                                >
                                                    <path
                                                        d="M0 -2L20 40L0 82"
                                                        vectorEffect="non-scaling-stroke"
                                                        stroke="currentcolor"
                                                        strokeLinejoin="round"
                                                    />
                                                </svg>
                                            </div>
                                        </>) : null}
                                    </li>))}
                            </ol>
                        </nav>
                    </div>
                    <div className="bg-gray-50 px-4 py-5 sm:p-6">
                        {/* Content goes here */}

                        <div>{/*<ResumeProfil user={user}></ResumeProfil>*/}</div>
                    </div>
                </div>
            </div>
        </div>
    </>)
}

export default InitAccount


async function getUserFromSession(session) {
    if (!session) return null


    const userData = await fetch(`${process.env.NEXT_PUBLIC_API_URL}api/users/me`, {
        method: 'GET', headers: {
            // 	token
            'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${session.jwt}`,
        },
    })

    return userData.json();
}
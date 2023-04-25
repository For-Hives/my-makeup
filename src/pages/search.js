import Head from 'next/head';
import React from 'react';
import Image from 'next/image';


import { EnvelopeIcon, PhoneIcon } from '@heroicons/react/20/solid';
import Nav from '@/components/Global/Nav';
import Hero from '@/components/Global/Hero';
import Presentation from '@/components/Home/Presentation';
import Talents from '@/components/Home/Talents';
import Collaboration from '@/components/Home/Collaboration';
import Project from '@/components/Home/Project';
import CTA from '@/components/Global/CTA';
import Footer from '@/components/Global/Footer';


const people = [


	{
		name: 'Jane Cooper',
		title: 'Paradigm Representative',
		role: 'Admin',
		email: 'janecooper@example.com',
		telephone: '+1-202-555-0170',
		imageUrl:
			'https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=4&w=256&h=256&q=60',
	}, {
		name: 'Jane Cooper',
		title: 'Paradigm Representative',
		role: 'Admin',
		email: 'janecooper@example.com',
		telephone: '+1-202-555-0170',
		imageUrl:
			'https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=4&w=256&h=256&q=60',
	}, {
		name: 'Jane Cooper',
		title: 'Paradigm Representative',
		role: 'Admin',
		email: 'janecooper@example.com',
		telephone: '+1-202-555-0170',
		imageUrl:
			'https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=4&w=256&h=256&q=60',
	}, {
		name: 'Jane Cooper',
		title: 'Paradigm Representative',
		role: 'Admin',
		email: 'janecooper@example.com',
		telephone: '+1-202-555-0170',
		imageUrl:
			'https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=4&w=256&h=256&q=60',
	}, {
		name: 'Jane Cooper',
		title: 'Paradigm Representative',
		role: 'Admin',
		email: 'janecooper@example.com',
		telephone: '+1-202-555-0170',
		imageUrl:
			'https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=4&w=256&h=256&q=60',
	}, {
		name: 'Jane Cooper',
		title: 'Paradigm Representative',
		role: 'Admin',
		email: 'janecooper@example.com',
		telephone: '+1-202-555-0170',
		imageUrl:
			'https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=4&w=256&h=256&q=60',
	}, {
		name: 'Jane Cooper',
		title: 'Paradigm Representative',
		role: 'Admin',
		email: 'janecooper@example.com',
		telephone: '+1-202-555-0170',
		imageUrl:
			'https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=4&w=256&h=256&q=60',
	}, {
		name: 'Jane Cooper',
		title: 'Paradigm Representative',
		role: 'Admin',
		email: 'janecooper@example.com',
		telephone: '+1-202-555-0170',
		imageUrl:
			'https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=4&w=256&h=256&q=60',
	},
	{
		name: 'Jane Cooper',
		title: 'Paradigm Representative',
		role: 'Admin',
		email: 'janecooper@example.com',
		telephone: '+1-202-555-0170',
		imageUrl:
			'https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=4&w=256&h=256&q=60',
	},
	// More people...
];


function Search() {
	return (
		<>
			<Head>
				<title>My Makeup</title>
				<meta
					name='description'
					content='Inscription sur my-makeup.fr la plateforme qui va révolutionner votre
                recherche de maquilleuses professionnelles, ou votre recherche de client !'
				/>
			</Head>

			<Nav />


			<main className={'relative m-36 h-[50vh] flex justify-center items-center'}>


				{/*	 search bar */}

				<form>
					<label htmlFor='default-search'
								 className='mb-2 text-sm font-medium text-gray-900 sr-only dark:text-white'>Search</label>
					<div className='relative'>
						<div className='absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none'>
							<svg aria-hidden='true' className='w-5 h-5 text-gray-500 dark:text-gray-400' fill='none'
									 stroke='currentColor' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'>
								<path stroke-linecap='round' stroke-linejoin='round' stroke-width='2'
											d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z'></path>
							</svg>
						</div>
						<input type='search' id='default-search'
									 className='block w-full p-4 px-36 pl-10 text-sm placeholder-red-400 text-gray-900 border border-gray-300 rounded-lg bg-gray-50 focus:ring-green-500 focus:border-green-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500'
									 placeholder='Search Mockups, Logos...'
									 name='search'

									 required />
						<button type='submit'
										className='text-white absolute right-2.5 bottom-2.5 bg-pink-500 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-green-400 font-medium rounded-lg text-sm px-4 py-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800'>Search
						</button>
					</div>
				</form>


				{/*	 Makeup Artist Grid */}

				<ul role=' list' className=' grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'>
					{people.map((person) => (
						<li
							key={person.email}
							className=' col-span-1 flex flex-col divide-y divide-gray-200 rounded-lg bg-white text-center shadow'
						>
							<div className=' flex flex-1 flex-col p-8'>
								<img className=' mx-auto h-32 w-32 flex-shrink-0 rounded-full' src={person.imageUrl} alt='' />
								<h3 className=' mt-6 text-sm font-medium text-gray-900'>{person.name}</h3>
								<dl className=' mt-1 flex flex-grow flex-col justify-between'>
									<dt className=' sr-only'>Title</dt>
									<dd className=' text-sm text-gray-500'>{person.title}</dd>
									<dt className=' sr-only'>Role</dt>
									<dd className=' mt-3'>
			        <span
								className=' inline-flex items-center rounded-full bg-green-50 px-2 py-1 text-xs font-medium
							text-green-700 ring-1 ring-inset ring-green-600/20'>
			          {person.role}
			        </span>
									</dd>
								</dl>
							</div>
							<div>
								<div className='-mt-px flex divide-x divide-gray-200'>
									<div className='flex w-0 flex-1'>
										<a
											href={`mailto:${person.email}`}
											className='relative -mr-px inline-flex w-0 flex-1 items-center justify-center gap-x-3 rounded-bl-lg border border-transparent py-4 text-sm font-semibold text-gray-900'
										>
											<EnvelopeIcon className='h-5 w-5 text-gray-400' aria-hidden='true' />
											Email
										</a>
									</div>
									<div className='-ml-px flex w-0 flex-1'>
										<a
											href={`tel:${person.telephone}`}
											className='relative inline-flex w-0 flex-1 items-center justify-center gap-x-3 rounded-br-lg border border-transparent py-4 text-sm font-semibold text-gray-900'
										>
											<PhoneIcon className='h-5 w-5 text-gray-400' aria-hidden='true' />
											Call
										</a>
									</div>
								</div>
							</div>
						</li>
					))}
				</ul>


			</main>

			<Footer />


		</>
	);
}

export default Search;

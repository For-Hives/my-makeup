import { Fragment } from 'react'

import {
	ArrowPathIcon,
	ChartPieIcon,
	CursorArrowRaysIcon,
	FingerPrintIcon,
	SquaresPlusIcon,
} from '@heroicons/react/24/outline'
import {
	ChevronDownIcon,
	PhoneIcon,
	PlayCircleIcon,
} from '@heroicons/react/20/solid'
import { Popover, Transition } from '@headlessui/react'

const solutions = [
	{
		description: 'Get a better understanding of your traffic',
		icon: ChartPieIcon,
		name: 'Analytics',
		href: '#',
	},
	{
		description: 'Speak directly to your customers',
		icon: CursorArrowRaysIcon,
		name: 'Engagement',
		href: '#',
	},
	{
		description: "Your customers' data will be safe and secure",
		icon: FingerPrintIcon,
		name: 'Security',
		href: '#',
	},
	{
		description: 'Connect with third-party tools',
		icon: SquaresPlusIcon,
		name: 'Integrations',
		href: '#',
	},
	{
		description: 'Build strategic funnels that will convert',
		name: 'Automations',
		icon: ArrowPathIcon,
		href: '#',
	},
]
const callsToAction = [
	{ icon: PlayCircleIcon, name: 'Watch demo', href: '#' },
	{ name: 'Contact sales', icon: PhoneIcon, href: '#' },
]

export default function ItemDrop() {
	return (
		<Popover className="relative">
			<Popover.Button className="inline-flex items-center gap-x-1 text-sm font-semibold leading-6 text-gray-900">
				<span>Solutions</span>
				<ChevronDownIcon aria-hidden="true" className="h-5 w-5" />
			</Popover.Button>

			<Transition
				as={Fragment}
				enter="transition ease-out duration-200"
				enterFrom="opacity-0 translate-y-1"
				enterTo="opacity-100 translate-y-0"
				leave="transition ease-in duration-150"
				leaveFrom="opacity-100 translate-y-0"
				leaveTo="opacity-0 translate-y-1"
			>
				<Popover.Panel className="absolute left-1/2 z-10 mt-5 flex w-screen max-w-max -translate-x-1/2 px-4">
					<div className="w-screen max-w-md flex-auto overflow-hidden rounded-3xl bg-white text-sm leading-6 shadow-lg ring-1 ring-gray-900/5">
						<div className="p-4">
							{solutions.map(item => (
								<div
									className="group relative flex gap-x-6 rounded-lg p-4 hover:bg-gray-50"
									key={item.name}
								>
									<div className="mt-1 flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-gray-50 group-hover:bg-white">
										<item.icon
											aria-hidden="true"
											className="h-6 w-6 text-gray-600 group-hover:text-indigo-600"
										/>
									</div>
									<div>
										<a className="font-semibold text-gray-900" href={item.href}>
											{item.name}
											<span className="absolute inset-0" />
										</a>
										<p className="mt-1 text-gray-600">{item.description}</p>
									</div>
								</div>
							))}
						</div>
						<div className="grid grid-cols-2 divide-x divide-gray-900/5 bg-gray-50">
							{callsToAction.map(item => (
								<a
									className="flex items-center justify-center gap-x-2.5 p-3 font-semibold text-gray-900 hover:bg-gray-100"
									href={item.href}
									key={item.name}
								>
									<item.icon
										aria-hidden="true"
										className="h-5 w-5 flex-none text-gray-400"
									/>
									{item.name}
								</a>
							))}
						</div>
					</div>
				</Popover.Panel>
			</Transition>
		</Popover>
	)
}

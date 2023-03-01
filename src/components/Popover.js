import {Fragment} from 'react'
import {Popover, Transition} from '@headlessui/react'
import {ChevronDownIcon} from '@heroicons/react/20/solid'

export default function PopoverComponent(props) {
    return (
        <Popover className="relative z-30">
            <Popover.Button className="inline-flex items-center gap-x-1 text-sm font-semibold leading-6 text-gray-900 focus:outline-0">
                <span>{props.name}</span>
                <ChevronDownIcon className="h-5 w-5" aria-hidden="true"/>
            </Popover.Button>

            <Transition
                as={Fragment}
                enter="transition ease-out duration-200"
                enterFrom="opacity-0 translate-y-1"
                enterTo="opacity-100 translate-y-0"
                leave="transition ease-in duration-150"
                leaveFrom="opacity-100 translate-y-0"
                leaveTo="opacity-0 translate-y-1"
                className="z-30"
            >
                <Popover.Panel className={"absolute left-1/2 z-30 mt-5 flex w-screen max-w-max px-4 -translate-x-[30%]"}>
                    <div className="w-screen max-w-md flex-auto overflow-hidden rounded-3xl bg-white text-sm leading-6 shadow-lg ring-1 ring-gray-900/5">
                        <div className="p-4">
                            {props.content.map((item) => (
                                <div key={item.name} className="group relative flex gap-x-6 rounded-lg p-4 hover:bg-gray-50">
                                    <div className="mt-1 flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-gray-50 group-hover:bg-white">
                                        {/*<item.icon className="h-6 w-6 text-gray-600 group-hover:text-indigo-600" aria-hidden="true"/>*/}
                                        <span className="material-symbols-rounded text-indigo-900">
                                            {item.icon}
                                        </span>
                                    </div>
                                    <div>
                                        <a href={item.href} className="font-semibold text-gray-900">
                                            {item.name}
                                            <span className="absolute inset-0"/>
                                        </a>
                                        <p className="mt-1 text-gray-600">{item.description}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </Popover.Panel>
            </Transition>
        </Popover>
    )
}

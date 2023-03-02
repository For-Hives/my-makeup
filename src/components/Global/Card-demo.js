import React from 'react';
import Image from "next/image";
import {FireIcon} from "@heroicons/react/24/outline";
import {StarIcon, HeartIcon} from "@heroicons/react/20/solid";


function CardDemo(props) {
    return (
        <div className={"w-[200px] h-auto relative bg-white rounded-xl flex gap-2 flex-col pb-4 shadow-2xl"}>
            <div className={"h-[150px] relative"}>
                <Image src={props.src} fill={true}
                       className={"object-cover rounded-t-xl"}
                       alt={"Trouver votre maquilleuse professionnelle"}/>
            </div>
            {/* if heart is true */}
            {
                props.heart ? (
                    <div className={"absolute top-0 right-0 flex justify-center items-center"}>
                        <HeartIcon className={"h-6 w-6 text-red-600 mr-2 mt-2"}/>
                    </div>) : null
            }
            <div className={"absolute ml-3 mt-[135px] flex justify-center items-center"}>
                <div className={"bg-white shadow rounded-lg w-full px-3 text-center " +
                    "flex items-center justify-center text-xs font-medium italic text-indigo-900/90 py-1"}>
                    <FireIcon className={"h-4 w-4 text-indigo-900 mr-2"}/>
                    Super maquilleuse
                </div>
            </div>
            {/*    Square */}
            <div className={"w-full px-4 flex justify-center items-center gap-1 mt-4"}>
                <div className={"bg-slate-100 rounded w-full px-4 h-4"}></div>
            </div>
            <div className={"w-full px-4 flex justify-center items-center gap-1"}>
                <div className={"bg-slate-100 rounded w-full px-4 h-4"}></div>
                <div className={"bg-slate-100 rounded w-full px-4 h-4"}></div>
                <div className={"bg-slate-100 rounded w-full px-4 h-4"}></div>
            </div>
            <div className={"w-full px-4 flex justify-center items-center gap-1"}>
                <div className={"bg-slate-100 rounded w-full px-4 h-4"}></div>
                <div className={"rounded w-full h-4 flex justify-end items-center"}>
                    {/* stars in css & html */}
                    <StarIcon className="h-4 w-4 text-yellow-500/90" aria-hidden="true"/>
                    <StarIcon className="h-4 w-4 text-yellow-500/90" aria-hidden="true"/>
                    <StarIcon className="h-4 w-4 text-yellow-500/90" aria-hidden="true"/>
                    <StarIcon className="h-4 w-4 text-yellow-500/90" aria-hidden="true"/>
                    <StarIcon className="h-4 w-4 text-yellow-500/90" aria-hidden="true"/>
                </div>
            </div>
        </div>
    );
}

export default CardDemo;

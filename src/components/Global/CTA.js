import Image from "next/image";

function Cta(props) {
    return (<div className={"w-full relative"}>
        <div className={"absolute w-[100%] h-full -z-10 left-0 top-0 overflow-visible"}>
            <Image className={"-z-10 object-cover overflow-visible"} alt={"blob"} fill src={"/assets/blob.svg"}/>
        </div>
        <div className="mx-auto max-w-7xl py-64 relative">
            <div className="mx-auto w-1/2 flex flex-col gap-16 z-20">
                <h2 className="text-4xl font-bold tracking-tight text-white sm:text-4xl text-center sm:leading-snug">
                    Rejoignez&nbsp;My-Makeup,

                    la&nbsp;communauté&nbsp;qui&nbsp;fait&nbsp;la&nbsp;différence.
                </h2>
                <div className={"flex justify-center gap-8"}>
                    <a href="/signup" className={"text-sm font-bold leading-6 bg-indigo-50 text-indigo-900 px-4 py-2 rounded-lg border-2 border-indigo-50"}>
                        Je cherche des maquilleuses
                    </a>
                    <a href="/signup" className={"text-sm font-bold leading-6 bg-transparent text-indigo-50 px-4 py-2 rounded-lg border-2 border-indigo-50"}>
                        Je cherche des missions
                    </a>
                </div>
            </div>
        </div>
    </div>);
}

export default Cta;
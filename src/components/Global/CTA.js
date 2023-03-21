import Image from "next/image";

function Cta(props) {
    return (
        <div className={"w-full relative"}>
            <Image className={"w-full h-full absolute z-0 left-0 top-0"} alt={"blob"} width={1000} height={500} src={"/assets/blob.svg"}/>
            <div className="mx-auto max-w-7xl py-52 ">
                <div className="mx-auto w-1/2 flex flex-col gap-16">
                    <h2 className="text-4xl font-bold tracking-tight text-slate-700 sm:text-4xl text-center sm:leading-snug">
                        Rejoignez&nbsp;My-Makeup,

                        la&nbsp;communauté&nbsp;qui&nbsp;fait&nbsp;la&nbsp;différence.
                    </h2>
                    <div className={"flex justify-center gap-8"}>
                        <a href="/signup" className={"text-sm font-bold leading-6 bg-indigo-900 text-white px-4 py-2 rounded-lg border-2 border-indigo-900"}>
                            Je cherche des maquilleuses
                        </a>
                        <a href="/signup" className={"text-sm font-bold leading-6 bg-transparent text-indigo-900 px-4 py-2 rounded-lg border-2 border-indigo-900"}>
                            Je cherche des missions
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Cta;
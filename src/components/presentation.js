import React from 'react';

function Presentation(props) {
    return (
        <section className={"relative bg-white mt-20"}>
            <div className="mx-auto max-w-7xl">
                <div className="mx-auto">
                    <h2 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-4xl text-center">
                        My Makeup c&apos;est avant tout une communauté
                    </h2>
                    <p className="mt-6 text-lg leading-8 text-slate-700 text-center">
                        Où les maquilleuses et les particuliers se retrouvent pour collaborer en tout simplicité.
                    </p>
                </div>
            </div>
        </section>
    );
}

export default Presentation;

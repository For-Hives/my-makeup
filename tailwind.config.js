/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./src/**/*.{js,ts,jsx,tsx}",], theme: {
        extend: {
            colors: {
                "my-makeup": {
                    900: "#16191c"
                }
            }
        },
    }, plugins: [],
}

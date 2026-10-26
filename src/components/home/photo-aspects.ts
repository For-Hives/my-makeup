/**
 * The width over the height of the photos that sit in an arch on the home page (read from the files: a test checks
 * them). `archSizes` needs it to ask the optimiser for a copy that covers the frame without being stretched.
 */
export const SOURCE_ASPECTS: Readonly<Record<string, number>> = {
	'/assets/maquilleuse_blog.webp': 1280 / 1920,
	'/assets/maquilleuse_mariage.webp': 1500 / 1000,
	'/assets/maquilleuse_soiree.webp': 1500 / 1000,
	'/assets/maquilleuse_evenementiel.webp': 1944 / 1295,
	'/assets/maquilleuse_fx.webp': 1500 / 1000,
}

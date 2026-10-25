/**
 * The faces of the art direction used to be loaded here, by the routes that needed them. They are now loaded once by
 * the public layout (`src/components/art/fonts.ts`); this file only keeps the names the routes import, so no face
 * is downloaded twice.
 */
export { body, display } from '@/components/art/fonts'

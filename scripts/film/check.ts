/**
 * Checks the seams of the film « L'Ombre nette » on the real files of public/assets/accueil/ (docs/accueil.md,
 * « Le film »): each loop comes back to its first frame, each intro ends on the first frame of its loop, the poster is
 * the first frame of the intro and the end still the first frame of the loop, in every format the page lists.
 *
 *   bun run film:check
 *
 * Run it before a new render goes into src/components/home/film.ts. It needs `ffmpeg` and `ffprobe`, and nothing
 * else: each frame is decoded to raw RGB at the size of the render, and compared here (scripts/film/seams.ts). Exit
 * code 1 when a seam is above the limit, or a file is missing.
 */

import { existsSync } from 'node:fs'
import path from 'node:path'
import { FILM_SIZE, FILM_STILLS, FILM_VIDEOS } from '../../src/components/home/film'
import { type FrameOf, rmse, SEAM_LIMIT, seamsOf } from './seams'

const PUBLIC = path.resolve(import.meta.dir, '../../public')

/** Runs a command without a shell and gives back what it wrote, as bytes. */
async function run(command: string[]): Promise<Uint8Array> {
	const child = Bun.spawn(command, { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' })
	const [out, err, code] = await Promise.all([
		new Response(child.stdout).arrayBuffer(),
		new Response(child.stderr).text(),
		child.exited,
	])
	if (code !== 0) throw new Error(`${command[0]} a échoué (${code}) : ${err.trim().split('\n').at(-1) ?? ''}`)
	return new Uint8Array(out)
}

/** The number of frames of a video, counted by decoding it (the header of a file may not say). */
async function frameCount(file: string): Promise<number> {
	const out = await run([
		'ffprobe',
		'-v',
		'error',
		'-count_frames',
		'-select_streams',
		'v:0',
		'-show_entries',
		'stream=nb_read_frames',
		'-of',
		'csv=p=0',
		file,
	])
	const count = Number.parseInt(new TextDecoder().decode(out), 10)
	if (!Number.isInteger(count) || count < 1) throw new Error(`${file} : aucune image lue.`)
	return count
}

const frames = new Map<string, Promise<Uint8Array>>()

/** One frame, as RGB bytes at the size of the render. A still is read whole; a video gives its first or its last frame. */
function decode({ src, frame }: FrameOf): Promise<Uint8Array> {
	const key = `${src}#${frame}`
	const known = frames.get(key)
	if (known) return known
	const file = path.join(PUBLIC, src)
	const scale = `scale=${FILM_SIZE.width}:${FILM_SIZE.height}:flags=bicubic`
	const decoded = (async () => {
		const select = src.endsWith('.mp4') ? `select=eq(n\\,${frame === 'first' ? 0 : (await frameCount(file)) - 1}),` : ''
		const bytes = await run([
			'ffmpeg',
			'-v',
			'error',
			'-i',
			file,
			'-vf',
			`${select}${scale}`,
			'-frames:v',
			'1',
			'-f',
			'rawvideo',
			'-pix_fmt',
			'rgb24',
			'-',
		])
		const expected = FILM_SIZE.width * FILM_SIZE.height * 3
		if (bytes.length !== expected) throw new Error(`${src} (${frame}) : ${bytes.length} octets au lieu de ${expected}.`)
		return bytes
	})()
	frames.set(key, decoded)
	return decoded
}

async function main(): Promise<number> {
	const seams = seamsOf(FILM_VIDEOS, FILM_STILLS)
	const missing = [...new Set(seams.flatMap(({ a, b }) => [a.src, b.src]))].filter(
		src => !existsSync(path.join(PUBLIC, src))
	)
	if (missing.length > 0) {
		console.error(`Fichiers absents de public/ :\n${missing.map(src => `  ${src}`).join('\n')}`)
		return 1
	}
	let failures = 0
	for (const seam of seams) {
		const distance = rmse(await decode(seam.a), await decode(seam.b))
		const ok = distance < SEAM_LIMIT
		if (!ok) failures++
		console.log(`${ok ? 'ok   ' : 'ÉCART'} ${distance.toFixed(4)}  ${seam.label}`)
	}
	console.log(
		failures === 0
			? `Les ${seams.length} raccords du film sont sous ${SEAM_LIMIT}.`
			: `${failures} raccord(s) sur ${seams.length} au-dessus de ${SEAM_LIMIT} : le rendu est à reprendre avant d’entrer dans film.ts.`
	)
	return failures === 0 ? 0 : 1
}

if (import.meta.main) process.exit(await main())

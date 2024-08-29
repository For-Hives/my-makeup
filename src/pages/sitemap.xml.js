import React from 'react'

import { lstatSync, readdirSync } from 'fs'
import * as path from 'path'

const Sitemap = () => {
	return null
}

export const getServerSideProps = async ({ res }) => {
	// Function to get files from a directory recursively
	function getFilesFromDir(startPath) {
		let results = []

		function finder(startPath) {
			let files = readdirSync(startPath)

			for (const element of files) {
				let filename = path.join(startPath, element)
				let stat = lstatSync(filename)

				if (stat.isDirectory()) {
					finder(filename) // recurse
				} else {
					results.push(filename)
				}
			}
		}

		finder(startPath)

		return results
	}

	let files = getFilesFromDir('./src/pages')

	let staticPaths = files
		.filter(staticPagePath => {
			let base = path.basename(staticPagePath)
			return ![
				'_app.js',
				'_document.js',
				'404.js',
				'api',
				'api/sendMail',
				'index.js',
				'sitemap.xml.js',
			].includes(base)
		})
		.map(staticPagePath => {
			let parsedPath = path.parse(staticPagePath)
			let newPath = `${parsedPath.dir}/${parsedPath.name}`
				.replace('src\\pages\\', '')
				.replace('src\\pages', '')
				.replace('src/pages', '')
			return `${process.env.NEXT_PUBLIC_URL}/${newPath}`.replace(
				`${process.env.NEXT_PUBLIC_URL}//`,
				`${process.env.NEXT_PUBLIC_URL}/`
			)
		})

	// delete   'https://my-makeup.fr/profil/[username]', from the staticPaths
	staticPaths = staticPaths.filter(item => {
		return !(
			item === `${process.env.NEXT_PUBLIC_URL}/api\\auth/[...nextauth]` ||
			item === `${process.env.NEXT_PUBLIC_URL}/api/auth/[...nextauth]` ||
			item === `${process.env.NEXT_PUBLIC_URL}/api/sendMail` ||
			item === `${process.env.NEXT_PUBLIC_URL}/auth/profil` ||
			item === `${process.env.NEXT_PUBLIC_URL}/auth/error` ||
			item === `${process.env.NEXT_PUBLIC_URL}/auth/init-account` ||
			item === `${process.env.NEXT_PUBLIC_URL}/blog/[id]` ||
			item === `${process.env.NEXT_PUBLIC_URL}/talent/[slug]` ||
			item === `${process.env.NEXT_PUBLIC_URL}/profil/[username]` ||
			item === `${process.env.NEXT_PUBLIC_URL}/auth/verification-complete` ||
			item === `${process.env.NEXT_PUBLIC_URL}/auth/verification-wall`
		)
	})

	// get all users for dynamic paths
	const resultUsers = await fetch(
		`${process.env.NEXT_PUBLIC_API_URL}/api/makeup-artistes`,
		{
			headers: {
				// 	token
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			method: 'GET',
		}
	).then(result => result.json())

	const pathsUsers = resultUsers?.data?.map(record => {
		return `${process.env.NEXT_PUBLIC_URL}/profil/${record.attributes.username}`
	})

	// get all talents for dynamic paths
	const resultTalents = await fetch(
		`${process.env.NEXT_PUBLIC_API_URL}/api/talents`,
		{
			headers: {
				// 	token
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			method: 'GET',
		}
	).then(res => res.json())

	const pathsTalents = resultTalents?.data?.map(record => {
		return `${process.env.NEXT_PUBLIC_URL}/talent/${record.attributes.slug}`
	})

	// get all article for dynamic paths
	const resultBlog = await fetch(
		`${process.env.NEXT_PUBLIC_API_URL}/api/articles`,
		{
			headers: {
				// 	token
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			method: 'GET',
		}
	).then(res => res.json())

	const pathsBlog = resultBlog?.data?.map(record => {
		return `${process.env.NEXT_PUBLIC_URL}/blog/${record.attributes.slug}`
	})

	const allPaths = [
		...staticPaths,
		...pathsUsers,
		...pathsTalents,
		...pathsBlog,
	]

	const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      ${allPaths
				.map(url => {
					return `
            <url>
              <loc>${url}</loc>
              <lastmod>${new Date().toISOString()}</lastmod>
              <changefreq>weekly</changefreq>
              <priority>1.0</priority>
            </url>
          `
				})
				.join('')}
    </urlset>
  `

	res.setHeader('Content-Type', 'text/xml')
	res.write(sitemap)
	res.end()

	return {
		props: {},
	}
}

export default Sitemap

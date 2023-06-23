import React from 'react'
import { readdirSync } from 'fs'
const Sitemap = () => {
	return null
}

export const getServerSideProps = async ({ res }) => {
	const staticPaths = readdirSync('./src/pages')
		.filter(staticPage => {
			return ![
				'api',
				'_app.js',
				'_document.js',
				'404.js',
				'sitemap.xml.js',
			].includes(staticPage)
		})
		.map(staticPagePath => {
			// todo <url>
			// <loc>https://my-makeup.fr//profil</loc>
			// <lastmod>2023-06-23T21:09:54.904Z</lastmod>
			// <changefreq>weekly</changefreq>
			// <priority>1.0</priority>
			// </url>

			// todo
			// virer les .js
			// le //
			// le directory
			return `${process.env.NEXT_PUBLIC_URL}/${staticPagePath}`
		})

	// get all users for dynamic paths
	const resultUsers = await fetch(
		`${process.env.NEXT_PUBLIC_API_URL}api/makeup-artistes`,
		{
			method: 'GET',
			headers: {
				// 	token
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
		}
	).then(result => result.json())

	const pathsUsers = resultUsers?.data?.map(record => {
		return `https://my-makeup.fr/profil/${record.attributes.username}`
	})

	// get all talents for dynamic paths
	const resultTalents = await fetch(
		`${process.env.NEXT_PUBLIC_API_URL}api/talents`,
		{
			method: 'GET',
			headers: {
				// 	token
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
		}
	).then(res => res.json())

	const pathsTalents = resultTalents?.data?.map(record => {
		return `https://my-makeup.fr/talent/${record.attributes.slug}`
	})
	console.log(pathsTalents)

	// get all article for dynamic paths
	const resultBlog = await fetch(
		`${process.env.NEXT_PUBLIC_API_URL}api/articles`,
		{
			method: 'GET',
			headers: {
				// 	token
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
		}
	).then(res => res.json())

	const pathsBlog = resultBlog?.data?.map(record => {
		return `https://my-makeup.fr/blog/${record.attributes.slug}`
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

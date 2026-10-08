import { Head, Html, Main, NextScript } from 'next/document'
import { beforeSendScript, umamiScriptAttributes } from '@/lib/umami'
import { deployedVersion } from '@/lib/version'
import packageJson from '../../package.json'

// Umami through the site (MES-10, plans/04 §3.1), in production builds only:
// `next dev` never counts a visit. Build-time values only (NEXT_PUBLIC_*,
// BUILD_SOURCE_COMMIT from next.config.js), so that prerendered pages and
// pages rendered later carry the same tag.
const UMAMI =
	process.env.NODE_ENV === 'production'
		? umamiScriptAttributes({
				tag: deployedVersion({
					buildVersion: process.env.NEXT_PUBLIC_APP_VERSION,
					commit: process.env.BUILD_SOURCE_COMMIT,
					packageVersion: packageJson.version,
				}),
				domains: process.env.NEXT_PUBLIC_UMAMI_DOMAINS,
			})
		: null
const AVANT_ENVOI = UMAMI ? beforeSendScript() : null

export default function Document() {
	return (
		<Html lang="fr">
			<Head>
				<link rel="icon" href="/favicon.webp" />
				{/* defines window.mmAvantEnvoi before the Umami script can send */}
				{AVANT_ENVOI && (
					<script dangerouslySetInnerHTML={{ __html: AVANT_ENVOI }} />
				)}
				{UMAMI && <script defer {...UMAMI} />}
			</Head>
			<body className={'bg-neutral-50'}>
				<Main />
				<NextScript />
			</body>
		</Html>
	)
}

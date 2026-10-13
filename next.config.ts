import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'

const dirname = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
	// `next dev` writes an AGENTS.md and a CLAUDE.md at the project root when it is started
	// by a coding agent. The guides of this repository are written by hand: nothing is generated.
	agentRules: false,
	// The project root is stated, not inferred: a lockfile higher up in the file tree
	// (a parent folder, another checkout) must not become the Turbopack root.
	turbopack: { root: dirname },
}

// withPayload must stay the outermost wrapper: it adds Payload's server packages and aliases.
export default withPayload(nextConfig, { devBundleServerPackages: false })

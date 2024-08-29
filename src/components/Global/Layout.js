import parse, { domToReact } from 'html-react-parser'
import Image from 'next/image'

const options = {
	replace: domNode => {
		if (domNode?.type === 'tag' && domNode?.name === 'img') {
			const { attribs } = domNode
			const { height, width, src, alt } = attribs

			return <Image alt={alt} height={500} src={src} width={500} />
		}

		return domNode
	},
}

export function Layout({ value }) {
	const parsedContent = parse(value, options)
	const replacedContent = domToReact(parsedContent, options)

	return <>{replacedContent}</>
}

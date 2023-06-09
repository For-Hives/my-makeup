import { read } from 'to-vfile'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkHtml from 'remark-html'

main()

async function main() {
	const file = await unified()
		.use(remarkParse)
		.use(remarkHtml)
		.process(await read('example.md'))

	console.log(String(file))
}

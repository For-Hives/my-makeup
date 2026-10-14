/**
 * The fake Umami of the bench (ticket 111): the two paths of an Umami instance the site relays,
 * `/script.js` and `/api/send`, and a way to read what was received.
 *
 * Its tracker is a small stand-in for the real one, not a copy: it reads the same attributes
 * (`data-website-id`, `data-host-url`, `data-domains`, `data-tag`, `data-before-send`), sends a
 * page view when it loads, runs the filter named by `data-before-send` before every send, gives
 * the token of the last answer back in `x-umami-cache`, and exposes `window.umami.track`.
 *
 * What it records of each send: the body, and whether a cookie, a Referer or an address header came
 * with it. Never the value of a cookie: the bench only needs to know that none was relayed.
 *
 *   GET    /script.js   the tracker
 *   POST   /api/send    records one send
 *   GET    /_recus      what was received, as JSON
 *   DELETE /_recus      forgets it
 *   GET    /_sante      who answers (the probe of the bench)
 *
 * Nothing of bun here: the helper that reads it (tests/outils/faux-umami.ts) also loads under Node.
 */

export const IDENTITE = 'faux-umami'

/** Headers the fake keeps a note of: names only, and the values that are not secrets. */
export interface Recu {
	/** The body of the send, parsed (`{ type, payload }`), or the text when it was not JSON. */
	corps: unknown
	/** True when a Cookie header came with it. */
	cookie: boolean
	/** True when a Referer header came with it. */
	referer: boolean
	/** True when an Authorization header came with it. */
	autorisation: boolean
	/** The address header the relay writes, as received: what Umami would read the visitor from. */
	adresse: string | null
	agent: string | null
	methode: string
}

const TRACKER = `(function(window){
var document=window.document;
var script=document.currentScript;
if(!script)return;
var attr=function(name){return script.getAttribute(name)};
var website=attr('data-website-id');
var host=attr('data-host-url')||new URL(script.src).origin;
var endpoint=host.replace(/\\/$/,'')+'/api/send';
var domains=(attr('data-domains')||'').split(',').map(function(d){return d.trim()}).filter(Boolean);
var tag=attr('data-tag');
var beforeSend=attr('data-before-send');
var cache;
var disabled=function(){
try{if(window.localStorage.getItem('umami.disabled'))return true}catch(e){}
return !website||(domains.length>0&&domains.indexOf(window.location.hostname)===-1);
};
var send=function(type,payload){
if(disabled())return Promise.resolve();
if(beforeSend&&typeof window[beforeSend]==='function'){
payload=window[beforeSend](type,payload);
if(!payload)return Promise.resolve();
}
var headers={'Content-Type':'application/json'};
if(cache)headers['x-umami-cache']=cache;
return window.fetch(endpoint,{method:'POST',body:JSON.stringify({type:type,payload:payload}),headers:headers,credentials:'omit'})
.then(function(res){return res.text()}).then(function(text){cache=text}).catch(function(){});
};
var base=function(){
return{website:website,hostname:window.location.hostname,language:window.navigator.language,title:document.title,url:window.location.href,referrer:document.referrer,tag:tag};
};
window.umami={
track:function(name,data){
var payload=base();
if(typeof name==='string'){payload.name=name;if(data)payload.data=data}
return send('event',payload);
}
};
window.umami.track();
})(window);
`

/** The headers of every answer: nothing is kept by a browser or a proxy. */
const SANS_CACHE = { 'Cache-Control': 'no-store' }

export interface FauxUmami {
	repondre: (requete: Request) => Promise<Response>
	/** What was received, oldest first. */
	recus: () => readonly Recu[]
}

export function creerFauxUmami(): FauxUmami {
	let recus: Recu[] = []

	async function repondre(requete: Request): Promise<Response> {
		const { pathname } = new URL(requete.url)
		const methode = requete.method.toUpperCase()
		if (pathname === '/_sante' && methode === 'GET')
			return Response.json({ service: IDENTITE }, { headers: SANS_CACHE })
		if (pathname === '/script.js' && methode === 'GET')
			return new Response(TRACKER, {
				headers: { ...SANS_CACHE, 'Content-Type': 'text/javascript; charset=utf-8' },
			})
		if (pathname === '/api/send' && methode === 'POST') {
			const texte = await requete.text()
			let corps: unknown = texte
			try {
				corps = JSON.parse(texte)
			} catch {
				// kept as text: the bench wants to see what arrived
			}
			recus.push({
				corps,
				cookie: requete.headers.has('cookie'),
				referer: requete.headers.has('referer'),
				autorisation: requete.headers.has('authorization'),
				adresse: requete.headers.get('true-client-ip'),
				agent: requete.headers.get('user-agent'),
				methode,
			})
			// The real instance answers a token the tracker gives back; any text does here.
			return new Response('faux-jeton', { headers: { ...SANS_CACHE, 'Content-Type': 'text/plain' } })
		}
		if (pathname === '/_recus' && methode === 'GET') return Response.json(recus, { headers: SANS_CACHE })
		if (pathname === '/_recus' && methode === 'DELETE') {
			recus = []
			return new Response(null, { status: 204, headers: SANS_CACHE })
		}
		return new Response('Faux Umami : chemin inconnu.\n', { status: 404, headers: SANS_CACHE })
	}

	return { repondre, recus: () => recus }
}

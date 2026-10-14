/**
 * Umami served from the site itself (ticket 111, plan 04 §3.1): the browser loads `/u/script.js`
 * and posts to `/u/api/send`, and the site relays both to the Umami instance (`UMAMI_ORIGIN`,
 * src/lib/env.ts) without cookie nor Referer. A blocker that filters the domain of the instance
 * no longer hides real visits, and moving the instance only changes `UMAMI_ORIGIN`.
 *
 * This file and its neighbours (events.ts, track.ts, relais.ts, WebVitals) are the only code of the
 * application that knows Umami (a static test keeps it so, ticket 143).
 */

import { deployedVersion, type VersionSources } from '../version'

/** Public: it is in the HTML of every page. Kept when the instance moves, with its history. */
export const UMAMI_WEBSITE_ID = 'e7010ee5-a940-4add-80bf-5483d2c515db'

/** The path the site serves Umami under. */
export const UMAMI_PROXY_PREFIX = '/u'

/** The two paths of the instance the site serves: never its dashboard, its login or the rest of its API. */
export const UMAMI_SCRIPT_PATH = `${UMAMI_PROXY_PREFIX}/script.js`
export const UMAMI_SEND_PATH = `${UMAMI_PROXY_PREFIX}/api/send`

/** The name of the filter Umami calls before every send (`data-before-send`). */
export const BEFORE_SEND_NAME = 'mmAvantEnvoi'

/** The name of the waiting room of the events tracked before the Umami script has run. */
export const WAITING_ROOM_NAME = 'mmAttenteUmami'

/** At most this many events wait for the script. */
export const WAITING_ROOM_MAX = 20

/** The hostnames Umami counts visits on. Elsewhere (a local build, the pre-production) the script sends nothing. */
export const DEFAULT_UMAMI_DOMAINS: readonly string[] = ['my-makeup.fr', 'www.my-makeup.fr']

/** The longest `data-tag` Umami keeps (the size of its column). */
const TAG_MAX_LENGTH = 50

const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/
const TAG_FORBIDDEN_START = /^[=+\-@\s]+/

/**
 * The hostnames Umami counts visits on (`data-domains`), from NEXT_PUBLIC_UMAMI_DOMAINS (comma
 * separated). Empty or without a valid name: the two hostnames of the site. Read when the pages are
 * built, with the version.
 */
export function umamiDomains(raw: string | undefined): string[] {
	const domains = (raw ?? '')
		.split(',')
		.map(domain => domain.trim().toLowerCase())
		.filter(domain => HOSTNAME.test(domain))
	return domains.length > 0 ? [...new Set(domains)] : [...DEFAULT_UMAMI_DOMAINS]
}

/**
 * `data-tag` of the script: the deployed version, at most 50 characters, without the leading
 * characters Umami refuses (=, +, -, @: it drops the whole event).
 */
export function umamiTag(version: string | undefined): string {
	const tag = (version ?? '').trim().replace(TAG_FORBIDDEN_START, '').slice(0, TAG_MAX_LENGTH)
	return tag === '' ? 'unknown' : tag
}

/** The attributes of the Umami script tag (Umami 3: website id, host url, domains, tag, before-send). */
export function umamiScriptAttributes({
	domains,
	version,
}: {
	/** NEXT_PUBLIC_UMAMI_DOMAINS */
	domains?: string | undefined
	/** What /api/health shows: `deployedVersion` of the build. */
	version?: VersionSources | undefined
}): Record<string, string> {
	return {
		src: UMAMI_SCRIPT_PATH,
		'data-website-id': UMAMI_WEBSITE_ID,
		'data-host-url': UMAMI_PROXY_PREFIX,
		'data-domains': umamiDomains(domains).join(','),
		'data-tag': umamiTag(deployedVersion(version)),
		'data-before-send': BEFORE_SEND_NAME,
	}
}

/**
 * The inline script of the `<head>`: it defines the filter `window.mmAvantEnvoi`, the waiting room
 * `window.mmAttenteUmami`, then adds the Umami script.
 *
 * Written as a string on purpose. It reaches every browser untranspiled, and the live site once
 * lost the visits of Safari before 13.4 to a single `?.` that a build had left inside such a script:
 * no syntax after ES2019 here (a test reads the text, tests/unit/mesure-umami.test.ts).
 *
 * The filter. Umami calls `window.mmAvantEnvoi(type, payload)` before every send and sends nothing
 * when it gets a falsy value back. Nothing leaves:
 * - from an automated browser: `navigator.webdriver`, a HeadlessChrome user agent, a page shown
 *   inside a frame;
 * - from a browser that opted out (the `umami.disabled` key, which Umami also checks itself).
 * No list of robots that declare themselves is added: they stay counted (decisions of 13/10).
 * What leaves is cleaned: the page URL keeps its utm_* parameters only (no search terms, no codes,
 * no hash) and the referrer loses its query string and its hash. Ad click ids (gclid, fbclid…)
 * are dropped on purpose: campaigns are attributed with utm_*, and Facebook adds fbclid to every
 * outbound link, which would move organic social visits into the paid ads channel. A referrer that
 * is not a web page keeps its scheme and app id only. Any error: nothing is sent.
 *
 * The script is added async from here, never as a `<script>` tag of the page: a deferred Umami
 * would keep every page from hydrating while the instance is slow or silent. An event tracked
 * before the script ran waits in the room and goes to `window.umami.track`, in order, once the
 * script has run. If the script fails to load, the waiting events are dropped and no more are kept.
 */
const LOADER_SOURCE = `(function(w,attrs,max){
w.${BEFORE_SEND_NAME}=function(type,payload){
try{
var nav=w.navigator||{};
if(nav.webdriver)return false;
if(/HeadlessChrome/.test(String(nav.userAgent||'')))return false;
if(w.top!==w.self)return false;
var storage=null;
try{storage=w.localStorage}catch(e){storage=null}
if(storage&&storage.getItem('umami.disabled')!==null)return false;
if(!payload||typeof payload!=='object')return false;
var base=String(w.location&&w.location.href);
var clean=function(raw,keepCampaign){
if(typeof raw!=='string'||raw==='')return raw;
var url=new URL(raw,base);
if(url.protocol!=='http:'&&url.protocol!=='https:')return url.host?url.protocol+'//'+url.host+'/':'';
var kept=new URLSearchParams();
if(keepCampaign){url.searchParams.forEach(function(value,key){if(/^utm_[a-z]+$/.test(key))kept.append(key,value)})}
var query=kept.toString();
return url.origin+url.pathname+(query?'?'+query:'');
};
var copy=Object.assign({},payload);
if('url' in copy)copy.url=clean(copy.url,true);
if('referrer' in copy)copy.referrer=clean(copy.referrer,false);
return copy;
}catch(e){return false}
};
var waiting=[];
var state='loading';
var script=w.document.createElement('script');
Object.keys(attrs).forEach(function(name){script.setAttribute(name,attrs[name])});
script.async=true;
script.addEventListener('load',function(){
state='loaded';
var umami=w.umami;
waiting.splice(0).forEach(function(item){try{umami.track(item.name,item.data)}catch(e){}});
});
script.addEventListener('error',function(){state='failed';waiting.length=0});
w.${WAITING_ROOM_NAME}=function(name,data){
if(state!=='loading'||waiting.length>=max)return false;
waiting.push({name:name,data:data});
return true;
};
(w.document.head||w.document.documentElement).appendChild(script);
})`

/**
 * The text of the inline script, with the attributes of the Umami script frozen in. `<` is
 * escaped: no value can close the inline `<script>`.
 */
export function umamiLoaderScript(attributes: Record<string, string>): string {
	const json = JSON.stringify(attributes).replace(/</g, '\\u003c')
	return `${LOADER_SOURCE}(window,${json},${WAITING_ROOM_MAX});`
}

/** The script without its call: the tests read its syntax. */
export const UMAMI_LOADER_SOURCE = LOADER_SOURCE

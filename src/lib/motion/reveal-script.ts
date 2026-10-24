/**
 * The reveal of the blocks below the fold (docs/mouvement.md, « Apparition au défilement »): a block with the
 * `reveal` class rises and fades in once, when it comes into view. It is a few lines of inline script, not a
 * module: no byte is added to the bundles of the pages (the `public-client-graph` guard does not see it), the same
 * way the draw of the featured profiles is inline (docs/accueil.md).
 *
 * How it works, and why it never hides content for good:
 * - the stylesheet hides nothing by itself. Only this script puts `data-reveal="wait"` on a block, and only a block
 *   whose top is below the fold when the script first sees it: the first screen is never animated;
 * - an IntersectionObserver turns `wait` into `in` once, and stops watching it. The stylesheet eases the block
 *   back to its place (transform and opacity, 600 ms). `--reveal-i` (0 to 5) staggers the blocks that come into view
 *   together, 70 ms apart;
 * - a block that is already above the screen (a jump to an anchor) is shown at once;
 * - no script, no IntersectionObserver, reduced motion, edit mode, print: nothing is ever hidden;
 * - a MutationObserver sees the blocks a client-side navigation brings in (an inline script runs once per page load);
 * - any error leaves the page as it is: the `try` covers the whole script.
 *
 * It only touches `data-reveal` and the custom property `--reveal-i`, never a class React owns.
 */
const REVEAL_SCRIPT = `(()=>{try{
if(!("IntersectionObserver" in window)||matchMedia("(prefers-reduced-motion: reduce)").matches)return;
const io=new IntersectionObserver(es=>{let n=0;for(const e of es){const t=e.target,y=e.isIntersecting;
if(y||e.boundingClientRect.top<0){t.style.setProperty("--reveal-i",y?Math.min(n++,5):0);t.dataset.reveal="in";io.unobserve(t)}}},{rootMargin:"0px 0px -6% 0px"});
let q=0;
const scan=()=>{q=0;for(const t of document.querySelectorAll(".reveal:not([data-reveal])")){
if(t.closest("[data-edit-page]")||t.getBoundingClientRect().top<innerHeight){t.dataset.reveal="seen";continue}
t.dataset.reveal="wait";io.observe(t)}};
new MutationObserver(()=>{q||(q=requestAnimationFrame(scan))}).observe(document.documentElement,{childList:true,subtree:true});
scan()}catch(e){}})()`

/** The script, on one line, as the layout writes it. */
export const revealScript: string = REVEAL_SCRIPT.replace(/\n/g, '')

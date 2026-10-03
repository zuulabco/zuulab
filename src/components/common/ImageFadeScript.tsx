/**
 * Soft image reveal for the whole site, storefront and admin alike.
 *
 * Runs in <head> before the first paint: marks <html> with .img-fade and, for every
 * <img> that finishes loading (or fails), sets data-loaded so CSS fades it in
 * (see globals.css). load/error do not bubble, so they are caught in the capture
 * phase, which also covers images React adds later and lazy images loading on
 * scroll. Images already complete when the document finishes are swept in too.
 */
const script = `(function(){try{
var d=document,h=d.documentElement;h.classList.add('img-fade');
function mark(e){var t=e.target;if(t&&t.tagName==='IMG')t.setAttribute('data-loaded','')}
d.addEventListener('load',mark,true);d.addEventListener('error',mark,true);
function sweep(){var i=d.images;for(var k=0;k<i.length;k++){if(i[k].complete)i[k].setAttribute('data-loaded','')}}
d.addEventListener('DOMContentLoaded',sweep);
addEventListener('load',sweep);
}catch(_){}})();`

export default function ImageFadeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />
}

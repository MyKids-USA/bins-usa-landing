// node build-langs.mjs
//
// Writes bins-usa.com in every language from the English pages at the root.
//
//   /es/<page>       from the data-es text already in each English page
//   /<lang>/<page>   from i18n/<lang>.json, keyed by the English text of each element
//
// The English pages are the source: edit them (English and data-es together), add the
// new English text to every i18n/<lang>.json, and run this again. A string missing from
// a dictionary stops the build instead of shipping English inside a French page.
//
// It also keeps the <link rel="alternate" hreflang> block in every page, English ones
// included, so search engines know the sixteen versions are the same page.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const SITE = 'https://bins-usa.com';
const LANGS = ['en', 'es', 'fr', 'pt-BR', 'de', 'it', 'nl', 'ja', 'ko', 'zh', 'zh-Hant', 'hi', 'bn', 'ur', 'ar', 'he'];
const RTL = ['ar', 'he', 'ur'];
const PAGES = ['index.html', 'demo.html', 'features.html', 'how-it-works.html', 'pricing.html', 'faq.html', 'support.html', 'contact.html'];
const SPANISH_TOO = ['privacy.html', 'terms.html', 'accessibility.html'];
// The locale the Shopify App Store listing understands, where it has one.
const STORE_LOCALE = { es: 'es', fr: 'fr', 'pt-BR': 'pt-BR', de: 'de', it: 'it', nl: 'nl', ja: 'ja', ko: 'ko', zh: 'zh-CN', 'zh-Hant': 'zh-TW' };
// <title> of each page: the English page name is its nav label.
const TITLE_KEY = { 'demo.html': 'Demo', 'features.html': 'Features', 'how-it-works.html': 'How it works', 'pricing.html': 'Pricing',
  'faq.html': 'FAQ', 'support.html': 'Support', 'contact.html': 'Contact', 'privacy.html': 'Privacy', 'terms.html': 'Terms', 'accessibility.html': 'Accessibility' };

const pagesFor = l => (l === 'en' ? [...PAGES, ...SPANISH_TOO] : l === 'es' ? [...PAGES, ...SPANISH_TOO] : PAGES);
const urlFor = (l, p) => `${SITE}/${l === 'en' ? '' : l + '/'}${p === 'index.html' ? '' : p}`;
const unesc = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const escAttr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Every element carrying data-es: its open tag, inner HTML, and where they sit.
function elements(src) {
  const out = [];
  const open = /<(\w+)([^>]*?)\sdata-es="([^"]*)"([^>]*)>/g;
  let m;
  while ((m = open.exec(src))) {
    const tag = m[1];
    const start = m.index + m[0].length;
    const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
    re.lastIndex = start;
    let depth = 1, mm;
    while (depth && (mm = re.exec(src))) depth += mm[1] ? -1 : 1;
    out.push({ openStart: m.index, openEnd: start, closeStart: mm.index, tagOpen: m[0], es: unesc(m[3]), inner: src.slice(start, mm.index) });
  }
  return out;
}

function hreflangBlock(page) {
  const langs = LANGS.filter(l => pagesFor(l).includes(page));
  const lines = langs.map(l => `  <link rel="alternate" hreflang="${l}" href="${urlFor(l, page)}" />`);
  lines.push(`  <link rel="alternate" hreflang="x-default" href="${urlFor('en', page)}" />`);
  return `<!-- hreflang:start -->\n${lines.join('\n')}\n<!-- hreflang:end -->`;
}
function setHreflang(html, page, lang) {
  const block = `${hreflangBlock(page)}\n  <link rel="canonical" href="${urlFor(lang, page)}" />`;
  html = html.replace(/\s*<!-- hreflang:start -->[\s\S]*?<!-- hreflang:end -->\s*<link rel="canonical"[^>]*>/, '');
  return html.replace('</head>', `  ${block}\n</head>`);
}

function build(lang, page, dict) {
  let html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const missing = [];
  const tr = en => {
    if (lang === 'es') return null;
    const v = dict.pages[en];
    if (v === undefined) missing.push(en);
    return v;
  };
  // Replace from the end so earlier offsets stay valid.
  for (const el of elements(html).reverse()) {
    const en = el.inner.trim();
    const text = lang === 'es' ? el.es : tr(en);
    if (text == null) continue;
    const openTag = el.tagOpen.replace(/\sdata-es="[^"]*"/, '');
    html = html.slice(0, el.openStart) + openTag + text + html.slice(el.closeStart);
  }
  if (missing.length) throw new Error(`${lang}/${page}: ${missing.length} strings missing, first: ${JSON.stringify(missing[0])}`);

  const ex = en => {
    const v = dict.extra[en];
    if (v === undefined) throw new Error(`${lang}: extra string missing: ${en}`);
    return v;
  };
  // Attributes: alt, placeholder, the embedded video.
  html = html.replace(/(<[^>]*?)\salt="([^"]*)"([^>]*?)\sdata-es-alt="([^"]*)"/g,
    (all, a, enAlt, b, esAlt) => `${a} alt="${escAttr(lang === 'es' ? unesc(esAlt) : ex(unesc(enAlt)))}"${b}`);
  html = html.replace(/(<[^>]*?)\sdata-es-ph="([^"]*)"([^>]*?)\splaceholder="([^"]*)"/g,
    (all, a, esPh, b, enPh) => `${a}${b} placeholder="${escAttr(lang === 'es' ? unesc(esPh) : ex(unesc(enPh)))}"`);
  html = html.replace(/(<textarea[^>]*?)\sdata-es-ph="([^"]*)"([^>]*?)\splaceholder="([^"]*)"/g,
    (all, a, esPh, b, enPh) => `${a}${b} placeholder="${escAttr(lang === 'es' ? unesc(esPh) : ex(unesc(enPh)))}"`);
  html = html.replace(/(<[^>]*?)\ssrc="([^"]*)"([^>]*?)\sdata-es-src="([^"]*)"/g,
    (all, a, enSrc, b, esSrc) => `${a} src="${lang === 'es' ? esSrc : enSrc}"${b}`);
  if (/data-es-(alt|ph|src)=/.test(html)) throw new Error(`${lang}/${page}: an attribute was not translated`);

  // <html>, <title>, description, the language menu's label.
  html = html.replace(/<html lang="en">/, `<html lang="${lang}" dir="${RTL.includes(lang) ? 'rtl' : 'ltr'}">`);
  if (page === 'index.html') {
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${ex('Bins-USA — Shopify Warehouse Bin Management')}</title>`);
  } else {
    const name = dict.pages[TITLE_KEY[page]];
    if (!name) throw new Error(`${lang}/${page}: no name for the title`);
    html = html.replace(/<title>[^<]*—\s*Bins-USA<\/title>/, `<title>${name} — Bins-USA</title>`);
  }
  html = html.replace(/<meta name="description" content="[^"]*"/,
    `<meta name="description" content="${escAttr(ex('Organize your Shopify warehouse with bins, scan products, generate pick lists, and track inventory — all in one app.'))}"`);
  html = html.replace('aria-label="Language"', `aria-label="${escAttr(ex('Language'))}"`);

  // Links to pages that exist in this language stay in it; the blog and, outside
  // Spanish, the legal pages are English.
  const here = pagesFor(lang);
  // Either quote: the Spanish of contact.html links with href='/support.html'.
  html = html.replace(/href=(["'])\/(index\.html)?(#[^"']*)?\1/g, (all, q, i, hash) => `href=${q}/${lang}/${hash || ''}${q}`);
  html = html.replace(/href=(["'])\/([a-z-]+\.html)([#?][^"']*)?\1/g, (all, q, p, rest) =>
    here.includes(p) ? `href=${q}/${lang}/${p}${rest || ''}${q}` : all);
  // The install button opens the App Store listing in the visitor's language.
  if (STORE_LOCALE[lang]) html = html.replace(/href="https:\/\/apps\.shopify\.com\/bins-usa"/g, `href="https://apps.shopify.com/bins-usa?locale=${STORE_LOCALE[lang]}"`);

  // The strings scripts write after load (forms, Katya), keyed by their English.
  if (lang !== 'es') {
    const t = JSON.stringify(dict.extra).replace(/</g, '\\u003c');
    html = html.replace('<script src="/lang.js"></script>', `<script>window.BINS_T = ${t};</script>\n  <script src="/lang.js"></script>`);
  }
  html = html.replace('<html lang', `<!-- Written by build-langs.mjs from /${page}. Edit that page, not this one. -->\n<html lang`);
  return setHreflang(html, page, lang);
}

// Inter has no Arabic, Hebrew, Devanagari or Bengali; without a named font the browser
// picks whatever it has, which on a Mac put Urdu's Nastaliq on the Arabic pages.
const SCRIPT_FONT = {
  ar: 'Noto Sans Arabic', ur: 'Noto Naskh Arabic', he: 'Noto Sans Hebrew', hi: 'Noto Sans Devanagari', bn: 'Noto Sans Bengali',
};
function scriptFont(html, lang) {
  const font = SCRIPT_FONT[lang];
  if (!font) return html;
  const link = `<link href="https://fonts.googleapis.com/css2?family=${font.replace(/ /g, '+')}:wght@400;500;600;700&display=swap" rel="stylesheet" />`;
  const css = `<style id="script-font">body, button, input, select, textarea { font-family: 'Inter', '${font}', sans-serif; }</style>`;
  return html.replace('</head>', `  ${link}\n  ${css}\n</head>`);
}

function rtlCss(html, lang) {
  html = scriptFont(html, lang);
  if (!RTL.includes(lang)) return html;
  // The pages are laid out with physical left/right in places; mirror the few that
  // matter in a right-to-left page.
  const css = `<style id="rtl">
    #a11y-btn, #a11y-panel { left: auto !important; right: 20px !important; }
    /* Parked at left:-9999px in English; in a right-to-left page that side scrolls, so hide them in place instead. */
    .skip-link { left: auto; right: 0; transform: translateY(-120%); } .skip-link:focus { transform: none; }
    [aria-hidden="true"][style*="-9999px"] { left: 0 !important; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
    ul, ol { padding-right: 1.2em; padding-left: 0; }
  </style>`;
  return html.replace('</head>', `  ${css}\n</head>`);
}

let n = 0;
for (const lang of LANGS.filter(l => l !== 'en')) {
  const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', `${lang}.json`), 'utf8'));
  // Spanish lives in the English pages themselves (data-es); collect it for the titles.
  if (lang === 'es') {
    dict.pages = {};
    for (const p of pagesFor('es')) for (const el of elements(fs.readFileSync(path.join(ROOT, p), 'utf8'))) dict.pages[el.inner.trim()] = el.es;
  }
  fs.mkdirSync(path.join(ROOT, lang), { recursive: true });
  for (const page of pagesFor(lang)) {
    fs.writeFileSync(path.join(ROOT, lang, page), rtlCss(build(lang, page, dict), lang));
    n++;
  }
}
// The English pages get the same alternate links.
for (const page of pagesFor('en')) {
  const file = path.join(ROOT, page);
  fs.writeFileSync(file, setHreflang(fs.readFileSync(file, 'utf8'), page, 'en'));
}
console.log(`wrote ${n} pages in ${LANGS.length - 1} languages, and the alternate links in ${pagesFor('en').length} English pages`);

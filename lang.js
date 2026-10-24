/* Language of bins-usa.com.
 *
 * Every language has its own URLs: English at the root (/pricing.html), the others
 * under their code (/fr/pricing.html, /es/pricing.html …). Those pages are written by
 * build-langs.mjs from the English ones and i18n/<lang>.json, so each one is a real page
 * a search engine can index, and nothing here swaps text after load.
 *
 * This script only does two things:
 *   1. On an English page, send a visitor who chose another language here before (or,
 *      with no choice yet, whose browser asks for one we have) to that page. Loaded in
 *      <head>, before the body paints, so they do not see the English first.
 *   2. Fill the language menu, and go to the same page in the language picked.
 */
(function () {
  var LANGS = [
    ['en', 'English'], ['es', 'Español'], ['fr', 'Français'], ['pt-BR', 'Português (Brasil)'],
    ['de', 'Deutsch'], ['it', 'Italiano'], ['nl', 'Nederlands'], ['ja', '日本語'], ['ko', '한국어'],
    ['zh', '简体中文'], ['zh-Hant', '繁體中文'], ['hi', 'हिन्दी'], ['bn', 'বাংলা'], ['ur', 'اردو'],
    ['ar', 'العربية'], ['he', 'עברית']
  ];
  // Pages written in every language. The legal pages exist in English and Spanish only;
  // the blog has its own English/Spanish switch.
  var PAGES = ['index.html', 'demo.html', 'features.html', 'how-it-works.html', 'pricing.html', 'faq.html', 'support.html', 'contact.html'];
  var SPANISH_TOO = ['privacy.html', 'terms.html', 'accessibility.html'];
  var KEY = 'binsusa_lang';

  var cur = document.documentElement.lang || 'en';
  var page = location.pathname.split('/').pop() || 'index.html';

  function exists(l, p) {
    return l === 'en' || PAGES.indexOf(p) >= 0 || (l === 'es' && SPANISH_TOO.indexOf(p) >= 0);
  }
  function urlFor(l, p) {
    var base = l === 'en' ? '/' : '/' + l + '/';
    if (!exists(l, p) || p === 'index.html') return base;
    return base + p;
  }
  // What browsers and old saved values say, mapped onto our sixteen codes.
  function normalize(tag) {
    var t = String(tag || '').toLowerCase().replace('_', '-');
    if (!t) return null;
    if (t.indexOf('zh') === 0) return /hant|tw|hk|mo/.test(t) ? 'zh-Hant' : 'zh';
    if (t.indexOf('pt') === 0) return 'pt-BR';
    var base = t.split('-')[0];
    if (base === 'iw') return 'he';
    for (var i = 0; i < LANGS.length; i++) if (LANGS[i][0] === base) return base;
    return null;
  }

  if (cur === 'en') {
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) {}
    // The browser's language only chooses on arrival. A visitor already moving around
    // the site who lands on English either picked it or followed an English-only link,
    // and with storage blocked nothing else remembers that they picked it.
    var arriving = !document.referrer || document.referrer.indexOf(location.origin + '/') !== 0;
    var want = saved ? normalize(saved) : (arriving ? normalize(navigator.language) : null);
    if (want && want !== 'en' && exists(want, page)) {
      location.replace(urlFor(want, page) + location.search + location.hash);
      return;
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var pick = document.getElementById('langPick');
    if (!pick) return;
    LANGS.forEach(function (x) {
      var o = document.createElement('option');
      o.value = x[0]; o.textContent = x[1]; o.lang = x[0];
      if (x[0] === cur) o.selected = true;
      pick.appendChild(o);
    });
    pick.addEventListener('change', function () {
      try { localStorage.setItem(KEY, pick.value); } catch (e) {}
      location.href = urlFor(pick.value, page);
    });
  });
})();

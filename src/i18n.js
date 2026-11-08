// Traductions « en ligne » : T('texte français', 'english text').
let lang = 'fr';
try { lang = localStorage.getItem('dmf.lang') || 'fr'; } catch { /* stockage indisponible */ }
if (lang !== 'fr' && lang !== 'en') lang = 'en';

export const getLang = () => lang;
export function setLang(l) {
  lang = l === 'en' ? 'en' : 'fr';
  try { localStorage.setItem('dmf.lang', lang); } catch { /* ignore */ }
  document.documentElement.lang = lang;
}
export const T = (fr, en) => (lang === 'en' ? en : fr);
export const TL = (obj) => (obj && typeof obj === 'object' ? obj[lang] ?? obj.fr : obj);

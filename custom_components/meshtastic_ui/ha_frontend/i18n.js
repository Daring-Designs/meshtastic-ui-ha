/* Panel translations.
 *
 * Home Assistant translates config flows from translations/<lang>.json, but a
 * custom panel gets no help beyond hass.locale.language, so strings live in
 * locales/<lang>.js and are looked up with t("tab.key", { params }).
 *
 * The panel calls setLanguage() before its first render and whenever the
 * user's HA language changes. Missing keys fall back to English, and a key
 * missing from English too renders as the key itself so gaps are visible.
 */

import en from "./locales/en.js";
import ru from "./locales/ru.js";

const locales = { en, ru };

let currentLanguage = "en";

/** Pick the best locale for an HA language tag ("ru", "pt-BR"). Returns true if it changed. */
export function setLanguage(language) {
  const requested = String(language || "en").toLowerCase();
  const base = requested.split("-")[0];
  const next = locales[requested] ? requested : locales[base] ? base : "en";
  const changed = next !== currentLanguage;
  currentLanguage = next;
  return changed;
}

export function getLanguage() {
  return currentLanguage;
}

function lookup(dictionary, key) {
  return key.split(".").reduce((node, part) => (node == null ? undefined : node[part]), dictionary);
}

/**
 * Select the plural form for `count` in the current language.
 *
 * Plural entries are objects keyed by CLDR category, e.g.
 *   en: { one: "{count} node", other: "{count} nodes" }
 *   ru: { one: "{count} узел", few: "{count} узла", many: "{count} узлов", other: "{count} узла" }
 * Return the string to use for this count.
 */
function selectPlural(forms, count) {
  let rules = pluralRules.get(currentLanguage);
  if (!rules) {
    rules = new Intl.PluralRules(currentLanguage);
    pluralRules.set(currentLanguage, rules);
  }
  return forms[rules.select(count)] ?? forms.other;
}

const pluralRules = new Map();

/**
 * Translate `key`, substituting {name} placeholders from `params`.
 * When the entry is a plural object, `params.count` selects the form.
 */
export function t(key, params = {}) {
  let value = lookup(locales[currentLanguage], key);
  if (value === undefined) value = lookup(en, key);
  if (value === undefined) return key;
  if (typeof value === "object") value = selectPlural(value, Number(params.count ?? 0));
  return String(value).replace(/\{(\w+)\}/g, (match, name) =>
    name in params ? String(params[name]) : match
  );
}

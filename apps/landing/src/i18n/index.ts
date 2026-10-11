import { en, type Dict } from "./en";
import { es } from "./es";
import { pt } from "./pt";
import { tr } from "./tr";
import { vi } from "./vi";
import { id } from "./id";
import { ko } from "./ko";
import { ja } from "./ja";
import { zh } from "./zh";
import { hi } from "./hi";
import { fr } from "./fr";
import { de } from "./de";

/**
 * The languages the page ships in. English lives at `/`, every other one under
 * its own code (`/es`, `/ja`, …). Order is the order of the picker: the markets
 * where Solana and tokenized stocks have the most people first.
 *
 * `code` is the URL segment; `htmlLang` is the BCP 47 tag for <html lang> and
 * hreflang, so Portuguese reads as Brazilian and Chinese as Simplified.
 */
export const locales = [
  { code: "en", htmlLang: "en", label: "English", dict: en },
  { code: "es", htmlLang: "es", label: "Español", dict: es },
  { code: "pt", htmlLang: "pt-BR", label: "Português", dict: pt },
  { code: "tr", htmlLang: "tr", label: "Türkçe", dict: tr },
  { code: "vi", htmlLang: "vi", label: "Tiếng Việt", dict: vi },
  { code: "id", htmlLang: "id", label: "Bahasa Indonesia", dict: id },
  { code: "ko", htmlLang: "ko", label: "한국어", dict: ko },
  { code: "ja", htmlLang: "ja", label: "日本語", dict: ja },
  { code: "zh", htmlLang: "zh-CN", label: "简体中文", dict: zh },
  { code: "hi", htmlLang: "hi", label: "हिन्दी", dict: hi },
  { code: "fr", htmlLang: "fr", label: "Français", dict: fr },
  { code: "de", htmlLang: "de", label: "Deutsch", dict: de },
] as const satisfies readonly { code: string; htmlLang: string; label: string; dict: Dict }[];

export type Locale = (typeof locales)[number];
export const defaultLocale = locales[0];

/** The locale a URL is in: its first path segment when that is a code, else English. */
export function localeOf(url: URL): Locale {
  const segment = url.pathname.split("/")[1];
  return locales.find((l) => l.code === segment && l !== defaultLocale) ?? defaultLocale;
}

/** Shorthand for the components: the dictionary for the page being rendered. */
export function useDict(url: URL): Dict {
  return localeOf(url).dict;
}

/** The path of the home page in a locale. */
export function homePath(locale: Locale): string {
  return locale === defaultLocale ? "/" : `/${locale.code}`;
}

/** Fills `{name}` placeholders: fill("{n} tokens", { n: 18 }). */
export function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

export type { Dict };

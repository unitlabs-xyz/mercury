import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

import { site } from "./src/config/site.ts";

// Kept in step with src/i18n/index.ts: URL code to hreflang tag.
const locales = {
  en: "en", es: "es", pt: "pt-BR", tr: "tr", vi: "vi", id: "id",
  ko: "ko", ja: "ja", zh: "zh-CN", hi: "hi", fr: "fr", de: "de",
};

// Static output on purpose: every route is prerendered HTML, which is what the
// crawlers want and what makes the first paint free.
export default defineConfig({
  site: site.url,
  trailingSlash: "never",
  build: { inlineStylesheets: "auto" },
  // Off while every link is an anchor or a stub: it is the only thing that would
  // put JavaScript on the page. Turn it on once /blog and /signup are real.
  prefetch: false,
  integrations: [sitemap({ i18n: { defaultLocale: "en", locales } })],
  vite: { plugins: [tailwindcss()] },
});

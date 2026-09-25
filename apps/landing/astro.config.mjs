import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

import { site } from "./src/config/site.ts";

// Static output on purpose: every route is prerendered HTML, which is what the
// crawlers want and what makes the first paint free.
export default defineConfig({
  site: site.url,
  trailingSlash: "never",
  build: { inlineStylesheets: "auto" },
  // Off while every link is an anchor or a stub: it is the only thing that would
  // put JavaScript on the page. Turn it on once /blog and /signup are real.
  prefetch: false,
  integrations: [sitemap()],
  vite: { plugins: [tailwindcss()] },
});

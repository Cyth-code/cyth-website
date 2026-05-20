# Product Page memory / 5xx — investigation results

Date: 2026-05-20. Site: https://www.cyth.com (`siteId` in `wix.config.json`).

## 1. Wix logs (manual follow-up in dashboard)

Wix Site Monitoring is not available from this repo. After deploy, verify in **Wix Dashboard → Monitoring / Logs**:

- Filter path contains `/product-page/`
- Look for errors mentioning **memory**, **128MB**, **timeout**, or Velo line numbers in `Product Page.xrzft.js`
- Correlate timestamps with Google Search Console crawl spikes

## 2. External spot checks (Googlebot UA)

| URL | HTTP status |
|-----|-------------|
| `https://www.cyth.com/product-page/pmodda2-410-113` | 200 |
| `https://www.cyth.com/products/pmodda2-410-113` | 200 |

Sample URLs returned 200 at time of check; GSC 5xx may be intermittent (memory spikes on heavy SKUs) or historical.

**Sitemap note:** `store-products-sitemap.xml` lists `/products/...` URLs, not `/product-page/...`. GSC may still report `/product-page/` if that is the canonical Stores template route or from internal links.

## 3. Root-cause isolation (code-level)

| Block | Risk | Mitigation applied |
|-------|------|-------------------|
| `setDropdownOptions` `.contains().limit(1000)` | High — up to 1000 Import910 rows every load | Exact `.eq("model")`, cap 50, count pre-check, lazy-load on dropdown focus; skip for non-browser |
| Dual `descriptionHtml` on two elements | Medium | Set HTML on only the active multistate description element |
| Gallery `mediaItems` | Medium | Cap at 12 images |
| `loadDocsForProduct` | Medium | `.limit(20)`; skip entirely when `rendering.env !== 'browser'` |
| `masterPage.js` global `$w(...).forEach` | Medium | Early return when not in browser |

**Not the cause:** `async` on `$w.onReady` (syntax only).

## 4. GSC correlation checklist (post-deploy)

Export failing URLs from GSC and check in CMS (Import910 / Stores):

1. **Model family size** — count rows where `model` equals (not contains) the product’s model; if previously near 1000, dropdown was the prime suspect.
2. **Gallery image count** in Stores admin.
3. **`descriptionHtml` length**.
4. **Import911 doc rows** per product `_id`.

Re-run URL Inspection on 2–3 previously failing URLs after publish.

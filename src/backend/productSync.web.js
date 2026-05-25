import wixData from "wix-data";
import { webMethod, Permissions } from "wix-web-module";
import { elevate } from "wix-auth";
import { products } from "wix-stores.v2";

const COLLECTION = "SEOProductsImport";

const elevatedUpdateProduct = elevate(products.updateProduct);
const elevatedQueryProducts = elevate(products.queryProducts);

// CHANGED: larger default batch + tighter timebox usage
const DEFAULT_BATCH_SIZE = 25;
const TIME_BUDGET_MS = 12000;
const PRODUCT_PAGE_SIZE = 100;
const CONCURRENCY = 2;

// CHANGED: retry config for transient backend errors (504s, System error, ECONNRESET)
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 800;

let cachedSkuMap = null;
let cachedAt = 0;
const SKU_MAP_TTL_MS = 15 * 60 * 1000;

function nowMs() {
  return Date.now();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// CHANGED: classify errors so we only retry the transient ones
function isRetryableError(err) {
  const msg = (err && (err.message || err.toString() || "")).toLowerCase();
  return (
    msg.includes("504") ||
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("system error") ||
    msg.includes("econnreset") ||
    msg.includes("network") ||
    msg.includes("wde0055")
  );
}

function normalizeSeoData(raw) {
  if (!raw || typeof raw !== "object") return null;
  return raw;
}

function buildRowPatch(row, patch) {
  return { ...row, ...patch, updatedAt: new Date() };
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/* -----------------------------------------------------
   BUILD SKU → PRODUCT MAP (FAST PATH)
----------------------------------------------------- */

function extractSkusFromProduct(product) {
  const mapEntries = [];
  const productInfo = {
    _id: product._id,
    name: product.name || product.productName || "",
    slug: product.slug || "",
  };

  const push = (sku) => {
    if (sku) mapEntries.push([String(sku).trim(), productInfo]);
  };

  push(product.stockKeepingUnit);
  push(product.sku);

  if (Array.isArray(product.variants)) {
    product.variants.forEach((v) => {
      push(v.stockKeepingUnit);
      push(v.sku);
      push(v.variant?.stockKeepingUnit);
      push(v.variant?.sku);
    });
  }

  return mapEntries;
}

// CHANGED: wrap queryProducts pagination in retry as well, since that's where
// last night's stack traces showed PlatformizedQueryMethodWrapper.find blowing up
function buildSkuMap() {
  const skuMap = {};

  function addItems(items) {
    (items || []).forEach((p) => {
      extractSkusFromProduct(p).forEach(([sku, productInfo]) => {
        const key = sku ? String(sku).trim() : "";
        if (key && !skuMap[key]) skuMap[key] = productInfo;
      });
    });
  }

  function fetchPageWithRetry(fn, attempt = 0) {
    return fn().catch((err) => {
      if (attempt < MAX_RETRIES && isRetryableError(err)) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        return sleep(delay).then(() => fetchPageWithRetry(fn, attempt + 1));
      }
      throw err;
    });
  }

  return fetchPageWithRetry(() =>
    elevatedQueryProducts().limit(PRODUCT_PAGE_SIZE).find()
  ).then(function handle(res) {
    addItems(res?.items || []);
    if (!res.hasNext()) return skuMap;
    return fetchPageWithRetry(() => res.next()).then(handle);
  });
}

/* -----------------------------------------------------
   PROCESS ROW USING PREBUILT MAP
----------------------------------------------------- */

// CHANGED: extracted the actual update call so we can retry just that part
function updateProductWithRetry(productId, payload, attempt = 0) {
  return elevatedUpdateProduct(productId, payload).catch((err) => {
    if (attempt < MAX_RETRIES && isRetryableError(err)) {
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      return sleep(delay).then(() =>
        updateProductWithRetry(productId, payload, attempt + 1)
      );
    }
    throw err;
  });
}

function processRow(row, skuMap) {
  const sku = row.productId ? String(row.productId).trim() : "";
  const seoData = normalizeSeoData(row.seoData);

  if (!sku) {
    return Promise.resolve({
      ok: false,
      rowPatch: buildRowPatch(row, {
        finishedImporting: false,
        lastError: "Missing SKU",
      }),
    });
  }

  if (!seoData) {
    return Promise.resolve({
      ok: false,
      rowPatch: buildRowPatch(row, {
        finishedImporting: false,
        lastError: "Invalid seoData",
      }),
    });
  }

  const matchedProduct = skuMap[sku];

  if (!matchedProduct?._id) {
    return Promise.resolve({
      ok: false,
      rowPatch: buildRowPatch(row, {
        finishedImporting: false,
        lastError: `SKU_NOT_FOUND: ${sku}`,
      }),
    });
  }

  const detectedProductName = matchedProduct.name || "";
  const productSlug = row.slug || "";
  const slug = slugify(productSlug !== "" ? productSlug : detectedProductName);

  if (!slug) {
    return Promise.resolve({
      ok: false,
      rowPatch: buildRowPatch(row, {
        finishedImporting: false,
        lastError: `MATCHED_PRODUCT_NAME_MISSING: ${sku}`,
        realProductId: matchedProduct._id,
      }),
    });
  }

  return updateProductWithRetry(matchedProduct._id, { seoData, slug })
    .then(() => ({
      ok: true,
      rowPatch: buildRowPatch(row, {
        finishedImporting: true,
        lastError: "",
        realProductId: matchedProduct._id,
        appliedSlug: slug,
        matchedProductName: detectedProductName,
      }),
    }))
    .catch((err) => {
      const msg = (err && (err.message || err.toString())) || "Unknown error";
      return {
        ok: false,
        rowPatch: buildRowPatch(row, {
          finishedImporting: false,
          lastError: msg.slice(0, 2000),
          realProductId: matchedProduct._id,
        }),
      };
    });
}

/* -----------------------------------------------------
   CONCURRENCY + TIMEBOX RUNNER
----------------------------------------------------- */

function runBatch(items, skuMap, startTime) {
  const results = [];
  let index = 0;
  let inFlight = 0;
  let stopped = false;

  function shouldStop() {
    return nowMs() - startTime > TIME_BUDGET_MS - 1500;
  }

  return new Promise((resolve) => {
    function pump() {
      if (stopped) return;

      if (shouldStop()) {
        stopped = true;
        if (inFlight === 0) resolve(results);
        return;
      }

      while (inFlight < CONCURRENCY && index < items.length) {
        const row = items[index++];
        inFlight++;

        processRow(row, skuMap)
          .then((r) => results.push(r))
          .finally(() => {
            inFlight--;

            if (index >= items.length && inFlight === 0) {
              resolve(results);
              return;
            }

            if (stopped && inFlight === 0) {
              resolve(results);
              return;
            }

            pump();
          });
      }
    }

    pump();
  });
}

/* -----------------------------------------------------
   MAIN ENTRY
----------------------------------------------------- */
export const processNextSeoBatch = webMethod(
  Permissions.SiteMember,
  (batchSizeInput) => {
    const batchSize = Number(batchSizeInput) || DEFAULT_BATCH_SIZE;

    let skuMap;
    let startTime;

    return getSkuMap()
      .then((map) => {
        skuMap = map;

        // CHANGED: removed the .not(...contains 'SKU_NOT_FOUND') subquery.
        // SKU_NOT_FOUND rows are cheap to re-check (the skuMap is cached) and
        // removing the subquery sidesteps any nested-query weirdness on Wix Data.
        return wixData
          .query(COLLECTION)
          .ne("finishedImporting", true)
          .limit(batchSize)
          .ascending("_createdDate")
          .find();
      })
      .then((res) => {
        const items = res?.items || [];

        if (!items.length) {
          return {
            ok: true,
            processed: 0,
            updated: 0,
            failed: 0,
            continue: false,
            message: "No unfinished rows.",
            elapsedMs: 0,
          };
        }

        startTime = nowMs();

        return runBatch(items, skuMap, startTime).then((results) => {
          const updated = results.filter((r) => r.ok).length;
          const failed = results.length - updated;
          const patches = results.map((r) => r.rowPatch);

          return wixData
            .bulkSave(COLLECTION, patches, { suppressAuth: true })
            .then(() => ({
              ok: true,
              processed: results.length,
              updated,
              failed,
              continue: results.length === batchSize,
              elapsedMs: nowMs() - startTime,
            }));
        });
      });
  }
);

export const getImportStatus = webMethod(Permissions.SiteMember, () => {
  return wixData
    .query(COLLECTION) // CHANGED: use the constant, not a hardcoded string
    .ne("finishedImporting", true) // CHANGED: ne(true) is more accurate than eq(false) — catches rows where the field is unset/null
    .count()
    .then((remaining) => ({ remaining }));
});

function getSkuMap() {
  const now = nowMs();

  if (cachedSkuMap && now - cachedAt < SKU_MAP_TTL_MS) {
    return Promise.resolve(cachedSkuMap);
  }

  return buildSkuMap().then((map) => {
    cachedSkuMap = map;
    cachedAt = now;
    return map;
  });
}

// CHANGED: a tiny helper to force-refresh the cache from the page if needed
export const refreshSkuMap = webMethod(Permissions.SiteMember, () => {
  cachedSkuMap = null;
  cachedAt = 0;
  return getSkuMap().then((map) => ({ ok: true, skuCount: Object.keys(map).length }));
});

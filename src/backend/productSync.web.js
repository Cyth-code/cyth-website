import wixData from "wix-data";
import { webMethod, Permissions } from "wix-web-module";
import { elevate } from "wix-auth";
import { products } from "wix-stores.v2";

const COLLECTION = "SEOProductsImport";

const elevatedUpdateProduct = elevate(products.updateProduct);
const elevatedQueryProducts = elevate(products.queryProducts);

const DEFAULT_BATCH_SIZE = 25;
const TIME_BUDGET_MS = 12000;
const PRODUCT_PAGE_SIZE = 100;
const CONCURRENCY = 2;

let cachedSkuMap = null;
let cachedAt = 0;
const SKU_MAP_TTL_MS = 15 * 60 * 1000; // 15 minutes

function nowMs() {
  return Date.now();
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
    slug: product.slug || ""
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

  return elevatedQueryProducts()
    .limit(PRODUCT_PAGE_SIZE)
    .find()
    .then(function handle(res) {
      addItems(res?.items || []);
      return res.hasNext() ? res.next().then(handle) : skuMap;
    });
}

/* -----------------------------------------------------
   PROCESS ROW USING PREBUILT MAP
----------------------------------------------------- */

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
  const slug = slugify(productSlug != "" ? productSlug : detectedProductName);

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

  return elevatedUpdateProduct(matchedProduct._id, {
    seoData,
    slug,
  })
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
    return nowMs() - startTime > (TIME_BUDGET_MS - 1500);
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

        return wixData
          .query(COLLECTION)
          .ne("finishedImporting", true)
          .not(wixData.query(COLLECTION).contains("lastError", "SKU_NOT_FOUND"))
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
    .query("SEOProductsImport")
    .eq("finishedImporting", false)
    .count()
    .then((remaining) => ({ remaining }));
});

function getSkuMap() {
  const now = nowMs();

  if (cachedSkuMap && (now - cachedAt) < SKU_MAP_TTL_MS) {
    return Promise.resolve(cachedSkuMap);
  }

  return buildSkuMap().then((map) => {
    cachedSkuMap = map;
    cachedAt = now;
    return map;
  });
}
// import wixData from "wix-data";
// import { webMethod, Permissions } from "wix-web-module";
// import { elevate } from "wix-auth";
// import { products } from "wix-stores.v2";

// const COLLECTION = "SEOProductsImport";

// const elevatedUpdateProduct = elevate(products.updateProduct);
// const elevatedQueryProducts = elevate(products.queryProducts);

// const DEFAULT_BATCH_SIZE = 25;
// const TIME_BUDGET_MS = 12000;
// const PRODUCT_PAGE_SIZE = 100;
// const CONCURRENCY = 2;

// let cachedSkuMap = null;
// let cachedAt = 0;
// const SKU_MAP_TTL_MS = 15 * 60 * 1000; // 15 minutes

// function nowMs() {
//   return Date.now();
// }

// function normalizeSeoData(raw) {
//   if (!raw || typeof raw !== "object") return null;
//   return raw;
// }

// function buildRowPatch(row, patch) {
//   return { ...row, ...patch, updatedAt: new Date() };
// }

// /* -----------------------------------------------------
//    BUILD SKU → PRODUCT MAP (FAST PATH)
// ----------------------------------------------------- */

// function extractSkusFromProduct(product) {
//   const mapEntries = [];
//   const pid = product._id;

//   const push = (sku) => { if (sku) mapEntries.push([String(sku).trim(), pid]); };

//   push(product.stockKeepingUnit);
//   push(product.sku);

//   if (Array.isArray(product.variants)) {
//     product.variants.forEach((v) => {
//       push(v.stockKeepingUnit);
//       push(v.sku);
//       push(v.variant?.stockKeepingUnit);
//       push(v.variant?.sku);
//     });
//   }

//   return mapEntries;
// }

// function buildSkuMap() {
//   const skuMap = {};

//   function addItems(items) {
//     (items || []).forEach((p) => {
//       extractSkusFromProduct(p).forEach(([sku, id]) => {
//         const key = sku ? String(sku).trim() : "";
//         if (key && !skuMap[key]) skuMap[key] = id;
//       });
//     });
//   }

//   return elevatedQueryProducts()
//     .limit(PRODUCT_PAGE_SIZE)
//     .find()
//     .then(function handle(res) {
//       addItems(res?.items || []);
//       return res.hasNext() ? res.next().then(handle) : skuMap;
//     });
// }

// /* -----------------------------------------------------
//    PROCESS ROW USING PREBUILT MAP
// ----------------------------------------------------- */

// function processRow(row, skuMap) {
//   const sku = row.productId ? String(row.productId).trim() : "";
//   // console.log(sku)
//   const seoData = normalizeSeoData(row.seoData);

//   if (!sku) {
//     return Promise.resolve({
//       ok: false,
//       rowPatch: buildRowPatch(row, {
//         finishedImporting: false,
//         lastError: "Missing SKU",
//       }),
//     });
//   }

//   if (!seoData) {
//     return Promise.resolve({
//       ok: false,
//       rowPatch: buildRowPatch(row, {
//         finishedImporting: false,
//         lastError: "Invalid seoData",
//       }),
//     });
//   }

//   const realProductId = skuMap[sku];

//   if (!realProductId) {
//     return Promise.resolve({
//       ok: false,
//       rowPatch: buildRowPatch(row, {
//         finishedImporting: false,
//         lastError: `SKU_NOT_FOUND: ${sku}`,
//       }),
//     });
//   }

//   return elevatedUpdateProduct(realProductId, { seoData })
//     .then(() => ({
//       ok: true,
//       rowPatch: buildRowPatch(row, {
//         finishedImporting: true,
//         lastError: "",
//         realProductId,
//       }),
//     }))
//     .catch((err) => {
//       const msg = (err && (err.message || err.toString())) || "Unknown error";
//       return {
//         ok: false,
//         rowPatch: buildRowPatch(row, {
//           finishedImporting: false,
//           lastError: msg.slice(0, 2000),
//         }),
//       };
//     });
// }

// /* -----------------------------------------------------
//    CONCURRENCY + TIMEBOX RUNNER
// ----------------------------------------------------- */

// function runBatch(items, skuMap, startTime) {
//   const results = [];
//   let index = 0;
//   let inFlight = 0;
//   let stopped = false;

//   function shouldStop() {
//     return nowMs() - startTime > (TIME_BUDGET_MS - 1500);
//   }

//   return new Promise((resolve) => {
//     function pump() {
//       if (stopped) return;

//       if (shouldStop()) {
//         stopped = true;
//         if (inFlight === 0) resolve(results);
//         return;
//       }

//       while (inFlight < CONCURRENCY && index < items.length) {
//         const row = items[index++];
//         inFlight++;

//         processRow(row, skuMap)
//           .then((r) => results.push(r))
//           .finally(() => {
//             inFlight--;

//             if (index >= items.length && inFlight === 0) {
//               resolve(results);
//               return;
//             }

//             if (stopped && inFlight === 0) {
//               resolve(results);
//               return;
//             }

//             pump();
//           });
//       }
//     }

//     pump();
//   });
// }

// /* -----------------------------------------------------
//    MAIN ENTRY
// ----------------------------------------------------- */
// export const processNextSeoBatch = webMethod(
//   Permissions.SiteMember,
//   (batchSizeInput) => {
//     const batchSize = Number(batchSizeInput) || DEFAULT_BATCH_SIZE;

//     let skuMap;
//     let startTime;

//     return getSkuMap()
//       .then((map) => {
//         skuMap = map;

//         return wixData
//           .query(COLLECTION)
//           .ne("finishedImporting", true)
//           .not(wixData.query(COLLECTION).contains('lastError', 'SKU_NOT_FOUND'))
//           .limit(batchSize)
//           .ascending("_createdDate")
//           .find();
//       })
//       .then((res) => {
//         const items = res?.items || [];

//         if (!items.length) {
//           return {
//             ok: true,
//             processed: 0,
//             updated: 0,
//             failed: 0,
//             continue: false,
//             message: "No unfinished rows.",
//             elapsedMs: 0
//           };
//         }

//         startTime = nowMs(); // start timing only for row processing

//         return runBatch(items, skuMap, startTime).then((results) => {
//           const updated = results.filter((r) => r.ok).length;
//           const failed = results.length - updated;
//           const patches = results.map((r) => r.rowPatch);

//           return wixData
//             .bulkSave(COLLECTION, patches, { suppressAuth: true })
//             .then(() => ({
//               ok: true,
//               processed: results.length,
//               updated,
//               failed,
//               continue: results.length === batchSize,
//               elapsedMs: nowMs() - startTime,
//             }));
//         });
//       });
//   }
// );

// export const getImportStatus = webMethod(Permissions.SiteMember, () => {
//   return wixData
//     .query("SEOProductsImport")
//     .eq("finishedImporting", false)
//     .count()
//     .then((remaining) => ({ remaining }));
// });

// function getSkuMap() {
//   const now = nowMs();

//   if (cachedSkuMap && (now - cachedAt) < SKU_MAP_TTL_MS) {
//     return Promise.resolve(cachedSkuMap);
//   }

//   return buildSkuMap().then((map) => {
//     cachedSkuMap = map;
//     cachedAt = now;
//     return map;
//   });
// }

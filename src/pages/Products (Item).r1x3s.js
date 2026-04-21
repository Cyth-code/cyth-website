import wixSeoFrontend from "wix-seo-frontend";
import wixStores from "wix-stores-frontend";
import wixLocation from "wix-location-frontend";
import wixLocationFrontend from "wix-location-frontend";
import wixData from "wix-data";

// ================================
// DIAG helpers
// ================================
const L = (tag, payload) =>
  payload !== undefined ? console.log(`[DIAG] ${tag}:`, payload) : console.log(`[DIAG] ${tag}`);
const W = (tag, payload) => console.warn(`[WARN] ${tag}:`, payload);
const E = (tag, err) => console.error(`[ERR] ${tag}:`, err);

// ================================
// PAGE CONFIG (IDs that matter)
// ================================
const ADD_TO_CART_ID = "#button968";
const OPTIONS_DROPDOWN_ID = "#options1";
const MULTISTATE_ID = "#statebox8";

// ✅ Your actual states
const STATE_NO_MODEL = "noModel";
const STATE_MODEL = "model";

// Page text ids
const PREHEADER_ID = "#preHeader";
const PAGE_NAME_ID = "#pageName";
const PRIMARY_DESC_ID = "#primaryDesc";
const SUBHEADER_ID = "#subHeader";
const OBS_MESSAGE_ID = "#obsMessage";
const MODEL_SKU_ID = "#modelSku";
const PRICE_ID = "#price";

const DETAILS_ONLY_ID = "#detailsOnly";
const NO_MODEL_SKU_ID = "#noModelSku";
const NO_MODEL_PRICE_ID = "#noModelPrice";
const NO_MODEL_OBS_ID = "#noModelObsMessage";

// Competitor hover (optional)
const COMP_BUTTON_ID = "#competitorButton";
const COMP_BOX_ID = "#competitorPriceBox";
const DK_PRICE_ID = "#dkPrice";
const DK_STOCK_ID = "#dkStock";
const NW_PRICE_ID = "#nwPrice";
const NW_STOCK_ID = "#nwStock";
const NI_PRICE_ID = "#niPrice";
const CYTH_PRICE_ID = "#cythPrice";
const CYTH_STOCK_ID = "#cythStock";

// ================================
// STOCK TEXTS
// ================================
const inStockText = '<p style="color: #008000;"><strong>Stock Status: In-Stock Ready-to-Ship';
const outOfStockText = '<p style="color: #000000;"><strong>Stock Status: Available to Order</strong></p> ';
const obsoleteText = '<p style="color: #FF0000;"><strong>Stock Status: OBSOLETE - CONTACT CYTH</strong></p>';

// ================================
// CONFIG — Product Docs
// ================================
const PRODUCT_DOCS_COLLECTION = "Import911";
const PRODUCT_REF_FIELD = "reference";

const DOC_FIELDS = [
  { key: "docsNew", label: "Specifications" },
  { key: "gettingStarted", label: "Getting Started" },
  { key: "calibrationProcedure", label: "Calibration Procedure" }
];

// ================================
// Collection IDs
// ================================
const PRODUCTS_EXTENDED_COLLECTION_ID = "Import910";
const PARTNER_INVENTORY_COLLECTION_ID = "Import912";

let pageData, extData


// ================================
// Safe element getter
// ================================
function el(id) {
  try { return $w(id) ?? null; } catch { return null; }
}

function logElementPresence(label, ids) {
  const snapshot = ids.map((id) => ({ id, found: !!el(id) }));
  L(`element presence (${label})`, snapshot);
}

// ================================
// Mini-cart helper
// ================================
function openSideCart() {
  try {
    let opened = false;

    try {
      // @ts-ignore
      $w("ShoppingCartIcon").forEach((icon) => {
        if (opened) return;
        // @ts-ignore
        if (typeof icon.openMiniCart === "function") { icon.openMiniCart(); opened = true; return; }
        // @ts-ignore
        if (typeof icon.expandMiniCart === "function") { icon.expandMiniCart(); opened = true; return; }
        // @ts-ignore
        if (typeof icon.expand === "function") { icon.expand(); opened = true; return; }
        // @ts-ignore
        if (typeof icon.show === "function") { icon.show(); opened = true; return; }
      });
    } catch (_) {}

    if (opened) return;

    // @ts-ignore
    if (typeof wixStores.cart.showMiniCart === "function") { wixStores.cart.showMiniCart(); return; }
    // @ts-ignore
    if (typeof wixStores.cart.openCart === "function") { wixStores.cart.openCart(); return; }

    wixLocation.to("/cart");
  } catch (e) {
    W("openSideCart failed", e?.message);
    wixLocation.to("/cart");
  }
}

// ================================
// Dataset / current product
// ================================
function getProductDataset() {
  const candidates = ["#dynamicDataset", "#productPageDataset", "#dataset1"];
  for (const id of candidates) {
    try {
      const ds = $w(id);
      if (ds && typeof ds.onReady === "function") return ds;
    } catch (_) {}
  }

  try {
    // @ts-ignore
    const all = $w("Dataset");
    if (Array.isArray(all) && all.length) return all[0];
  } catch (_) {}

  return null;
}

async function getCurrentProductFromDataset() {
  const ds = getProductDataset();
  if (!ds) throw new Error("No dataset found on dynamic product page.");
  await new Promise((resolve) => ds.onReady(resolve));

  const item = await ds.getCurrentItem();

  L("dataset current item snapshot", {
    _id: item?._id,
    name: item?.name,
    sku: item?.sku,
    slug: item?.slug,
    productPageUrl: item?.productPageUrl,
    formattedPrice: item?.formattedPrice,
    seoData: item?.seoData
  });

  return item;
}

// ================================
// Quantity helper
// ================================
function getRequestedQty() {
  try {
    const q = $w("#qtyInput");
    const n = Number(q?.value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
  } catch {
    return 1;
  }
}

// ================================
// Extended product + inventory
// ================================
async function getExtendedProductData(pageSku) {
  L("ProductsExtended query start", { collectionId: PRODUCTS_EXTENDED_COLLECTION_ID, sku: pageSku });

  const res = await wixData
    .query(PRODUCTS_EXTENDED_COLLECTION_ID)
    .eq("sku", pageSku)
    .limit(1)
    .find();

  L("ProductsExtended query result", { totalCount: res.totalCount });

  const item = res.items?.[0];
  if (!item) {
    W("ProductsExtended missing for sku", pageSku);
    return {
      sku: pageSku,
      model: "empty",
      details: "empty",
      primaryDesc: "empty",
      defaultDesc: "No Description",
      optionIdentif: "",
      lifecycleStatus: "Contact Cyth For Life Cycle Status Information"
    };
  }

  L("ProductsExtended snapshot", {
    sku: item.sku,
    model: item.model,
    details: item.details,
    primaryDesc: item.primaryDesc,
    lifecyclePhase: item.lifecyclePhase,
    optionIdentif: item.optionIdentif
  });

  return {
    sku: item["sku"],
    model: item["model"] ?? "empty",
    details: item["details"] ?? "empty",
    primaryDesc: item["primaryDesc"] ?? "empty",
    defaultDesc: item["desc_original"] ?? "No Description",
    optionIdentif: item["optionIdentif"] ?? "",
    lifecycleStatus: item["lifecyclePhase"] ?? "Contact Cyth For Life Cycle Status Information"
  };
}

async function getPartnerInventoryData(pageSku) {
  L("PartnerInventory query start", { collectionId: PARTNER_INVENTORY_COLLECTION_ID, sku: pageSku });

  const res = await wixData
    .query(PARTNER_INVENTORY_COLLECTION_ID)
    .eq("sku", pageSku)
    .limit(1)
    .find();

  L("PartnerInventory query result", { totalCount: res.totalCount });

  const item = res.items?.[0];
  if (!item) return undefined;

  const digikeyQty = Number(item["digikey_inventory"] ?? 0);
  const newarkQty = Number(item["newark_inventory"] ?? 0);

  return {
    digikey_price: item["digikey_price"] ?? "Not Listed",
    digikey_inventory: digikeyQty > 0 ? "In Stock" : "Out of Stock",
    newark_price: item["newark_price"] ?? "Not Listed",
    newark_inventory: newarkQty > 0 ? "In Stock" : "Out of Stock",
    main_stock: item["inStock"] ? (inStockText + " as of " + item["last_updated"]) : outOfStockText,
    simple_stock: item["inStock"] ? "In Stock" : "Out of Stock"
  };
}

// ================================
// Dropdown options + navigation
// ================================
async function setDropdownOptions(modelName, currentSku) {
  const dd = el(OPTIONS_DROPDOWN_ID);
  if (!dd) { W("Dropdown not found", OPTIONS_DROPDOWN_ID); return; }

  const results = await wixData
    .query(PRODUCTS_EXTENDED_COLLECTION_ID)
    .contains("model", modelName)
    .limit(1000)
    .find();

  const items = results.items || [];
  L("options query results", { modelName, count: items.length });

  if (items.length <= 1) {
    dd.collapse?.();
    return;
  }

  dd.expand?.();

  const dropdownOptions = items.map((item) => ({
    label: item.optionIdentif ?? "No Modifications",
    value: item.sku
  }));

  let pageOptionIndex = 0;
  for (let i = 0; i < dropdownOptions.length; i++) {
    if (dropdownOptions[i].value === currentSku) pageOptionIndex = i;
  }

  dd.placeholder = dropdownOptions[pageOptionIndex]?.label || "Select Option";
  dropdownOptions.splice(pageOptionIndex, 1);
  dd.options = dropdownOptions;

  L("dropdown configured", { placeholder: dd.placeholder, options: dd.options.length });
}

function wireDropdownNavigation() {
  const dd = el(OPTIONS_DROPDOWN_ID);
  if (!dd) return;

  dd.onChange(async () => {
    try {
      const sku = dd.value;
      L("dropdown change", { sku });
      if (!sku) return;

      const prodRes = await wixData.query("Stores/Products").eq("sku", sku).limit(1).find();
      const prod = prodRes.items?.[0];
      if (!prod?.productPageUrl) {
        W("Stores/Products missing productPageUrl for sku", sku);
        return;
      }

      const DYNAMIC_PREFIX = "/products/";
      const parts = String(prod.productPageUrl).split("/");
      const slug = parts[2] || parts[parts.length - 1];
      const url = `${DYNAMIC_PREFIX}${slug}`;

      L("navigating to selected option", { url, productPageUrl: prod.productPageUrl });
      wixLocationFrontend.to(url);
    } catch (e) {
      E("dropdown nav failed", e);
    }
  });

  L("dropdown wired", { id: OPTIONS_DROPDOWN_ID });
}

// ================================
// Multistate switching (CORRECT + VERIFIED)
// ================================
async function changeStateVerified(ms, stateId) {
  if (!ms) return { ok: false, stateId, message: "no multistate element" };

  const before = ms.currentState?.id;

  try {
    await ms.changeState(stateId);
  } catch (err) {
    const msg = err?.message || String(err);
    return { ok: false, stateId, message: msg, before, after: ms.currentState?.id };
  }

  const after = ms.currentState?.id;
  const ok = after === stateId;

  return { ok, stateId, before, after, message: ok ? "switched" : "changeState returned but state did not change" };
}

async function ensureCorrectState(ms, isNoModel) {
  if (!ms) return;

  L("multistate before", { currentState: ms.currentState?.id, isNoModel });

  const target = isNoModel ? STATE_NO_MODEL : STATE_MODEL;
  const result = await changeStateVerified(ms, target);

  if (result.ok) {
    L("multistate switched", { to: target, before: result.before, after: result.after });
  } else {
    W("multistate switch FAILED", result);
  }

  L("multistate after", { currentState: ms.currentState?.id });
}

// ================================
// Docs
// ================================
function normalizeDoc(value, fallbackLabel) {
  if (!value) return null;

  if (Array.isArray(value)) {
    return value.length ? normalizeDoc(value[0], fallbackLabel) : null;
  }

  if (typeof value === "string") {
    const s = value.trim();
    if ((s.startsWith("[") && s.endsWith("]")) || (s.startsWith("{") && s.endsWith("}"))) {
      try { return normalizeDoc(JSON.parse(s), fallbackLabel); } catch (_) {}
    }
    return { displayName: fallbackLabel, fileUrl: s };
  }

  if (typeof value === "object") {
    const displayName = value.name || value.fileName || value.originalFileName || fallbackLabel;
    const fileUrl = value.fileUrl || value.url || null;
    if (!fileUrl) return null;
    return { displayName, fileUrl };
  }

  return null;
}

function collectDocs(row) {
  const docs = [];
  DOC_FIELDS.forEach(({ key, label }) => {
    const raw = row[key];

    if (Array.isArray(raw)) {
      raw.forEach((entry, idx) => {
        const doc = normalizeDoc(entry, `${label} ${idx + 1}`);
        if (doc) docs.push({ fieldKey: key, label, ...doc });
      });
      return;
    }

    const doc = normalizeDoc(raw, label);
    if (doc) docs.push({ fieldKey: key, label, ...doc });
  });

  return docs;
}

function matchesProduct(row, productId) {
  const ref = row?.[PRODUCT_REF_FIELD];
  if (!ref) return false;
  if (typeof ref === "string") return ref === productId;
  if (typeof ref === "object") return ref._id === productId;
  return false;
}

function setRepeaterVisibility(repeater, hasItems) {
  if (!repeater) return;
  if (hasItems) repeater.show?.();
  else repeater.hide?.();
}

let docsWiredOnce = false;

function wireDocsRepeatersOnce() {
  if (docsWiredOnce) return;
  const repeater1 = el("#repeater1");
  const repeater2 = el("#repeater2");
  if (!repeater1 || !repeater2) return;

  repeater1.onItemReady(($item, itemData) => {
    $item("#filename1").text = itemData.displayName || "";
    $item("#downloadButton1").onClick(() => {
      if (itemData.fileUrl) wixLocation.to(itemData.fileUrl);
    });
  });

  repeater2.onItemReady(($item, itemData) => {
    $item("#fileName").text = itemData.displayName || "";
    $item("#downloadButton").onClick(() => {
      if (itemData.fileUrl) wixLocation.to(itemData.fileUrl);
    });
  });

  docsWiredOnce = true;
  L("Docs repeaters wired once");
}

async function loadDocsForProduct(productId) {
  const repeater1 = el("#repeater1");
  const repeater2 = el("#repeater2");

  if (!repeater1 || !repeater2) {
    W("Docs repeaters missing (#repeater1 or #repeater2).");
    return;
  }

  wireDocsRepeatersOnce();

  repeater1.data = [];
  repeater2.data = [];
  setRepeaterVisibility(repeater1, false);
  setRepeaterVisibility(repeater2, false);

  if (!productId) {
    W("loadDocsForProduct: missing productId");
    return;
  }

  const res = await wixData.query(PRODUCT_DOCS_COLLECTION)
    .eq(PRODUCT_REF_FIELD, productId)
    .find();

  const rows = (res.items || []).filter((row) => matchesProduct(row, productId));

  const flatDocs = [];
  rows.forEach((row) => {
    collectDocs(row).forEach((d, idx) => {
      flatDocs.push({
        _id: `${row._id}-${d.fieldKey}-${idx}`,
        fieldKey: d.fieldKey,
        label: d.label,
        displayName: d.displayName,
        fileUrl: d.fileUrl
      });
    });
  });

  const specDoc = flatDocs.find((d) => d.fieldKey === "docsNew") || null;
  const otherDocs = flatDocs.filter((d) => d.fieldKey !== "docsNew");

  repeater1.data = specDoc ? [specDoc] : [];
  repeater2.data = otherDocs;

  setRepeaterVisibility(repeater1, repeater1.data.length > 0);
  setRepeaterVisibility(repeater2, repeater2.data.length > 0);

  L("docs bound", { specCount: repeater1.data.length, otherCount: repeater2.data.length });
}

// ================================
// Add to cart
// ================================
function wireAddToCart() {
  const btn = el(ADD_TO_CART_ID);
  if (!btn) {
    W("Add to cart button not found", ADD_TO_CART_ID);
    return;
  }

  btn.onClick(async () => {
    try {
      btn.disable?.();

      const latest = await getCurrentProductFromDataset();
      const pid = latest?._id;
      const qty = getRequestedQty();

      if (!pid) {
        W("No productId; cannot add to cart");
        btn.enable?.();
        return;
      }

      await wixStores.cart.addProducts([{ productId: pid, quantity: qty }]);
      L("added to cart", { productId: pid, quantity: qty });

      openSideCart();
      btn.enable?.();
    } catch (e) {
      E("addToCart handler", e);
      try { btn.enable?.(); } catch (_) {}
    }
  });

  L("Add-to-cart wired", { id: ADD_TO_CART_ID });
}

// ================================
// Page content
// ================================
async function setPageContentAndStates() {
  pageData = await getCurrentProductFromDataset();
  const pageSku = pageData?.sku;
  const priceFormatted = pageData?.formattedPrice;
  const STORE_DESC_MODEL_ID = "#storeDescModel";
  const STORE_DESC_NO_MODEL_ID = "#storeDescNoModel";
  const LIFECYCE_NO_MODEL_ID = "#lifecycleNoModel";
  const LIFECYCE_MODEL_ID = "#lifecycleModel";
 


  if (!pageSku) {
    W("No sku on dataset item; cannot setPageContent");
    return;
  }

  // --- Stores product description (from Stores/Products dataset item) ---
const storeDescRaw = pageData?.description ?? "";           // plain text (often)
const storeDescHtml = pageData?.descriptionHtml ?? "";      // rich text (sometimes)

// If your element is a *Text* element:
const storeDescText = (storeDescRaw || "").toString();

// If your element is a *Rich Text* element (supports .html), prefer HTML:
const descForHtml = (storeDescHtml || storeDescRaw || "").toString();

// Write into BOTH state elements (safe even if one is hidden/not in DOM yet)
const mDesc = el(STORE_DESC_MODEL_ID);
if (mDesc) {
  if ("html" in mDesc && descForHtml) mDesc.html = descForHtml;
  else mDesc.text = storeDescText;
}

const nDesc = el(STORE_DESC_NO_MODEL_ID);
if (nDesc) {
  if ("html" in nDesc && descForHtml) nDesc.html = descForHtml;
  else nDesc.text = storeDescText;
}

  extData = await getExtendedProductData(pageSku);

  // SEO + preheader
  const pre = el(PREHEADER_ID);
  if (extData.model != 'empty' && extData.model != '') pre.text = `${extData.model} | ${extData.sku}`;
  else pre.text = `${extData.sku}`

  $w("#imageX2").alt = pre.text

const mLifecycle = el(LIFECYCE_MODEL_ID);
if (mLifecycle) {
  mLifecycle.text = `Lifecycle: ${extData.lifecycleStatus}`;
  if(extData.lifecycleStatus === 'Active'){ mLifecycle.style.color = 'green'}
}

const nLifecycle = el(LIFECYCE_NO_MODEL_ID);
if (nLifecycle) {
  nLifecycle.text = `Lifecycle: ${extData.lifecycleStatus}`;
  if(extData.lifecycleStatus === 'Active'){ nLifecycle.style.color = 'green'}
}

  // Partner inventory
  let cythStockHtml = outOfStockText;
  try {
    const comp = await getPartnerInventoryData(pageSku);

    if (comp) {
      cythStockHtml = (extData.lifecycleStatus === "Active") ? comp.main_stock : obsoleteText;

      if (el(DK_PRICE_ID)) el(DK_PRICE_ID).text = "$" + comp.digikey_price;
      if (el(DK_STOCK_ID)) el(DK_STOCK_ID).text = comp.digikey_inventory;
      if (el(NW_PRICE_ID)) el(NW_PRICE_ID).text = "$" + comp.newark_price;
      if (el(NW_STOCK_ID)) el(NW_STOCK_ID).text = comp.newark_inventory;
      if (el(NI_PRICE_ID)) el(NI_PRICE_ID).text = "$0.00";
      if (el(CYTH_PRICE_ID)) el(CYTH_PRICE_ID).text = priceFormatted || "";
      if (el(CYTH_STOCK_ID)) el(CYTH_STOCK_ID).text = comp.simple_stock;

      const compBtn = el(COMP_BUTTON_ID);
      const compBox = el(COMP_BOX_ID);
      if (compBtn && compBox) {
        compBtn.onMouseIn(() => compBox.show("fade", { duration: 300 }));
        compBtn.onMouseOut(() => compBox.hide("fade", { duration: 300 }));
      }
    }
  } catch (e) {
    L("competitor block skipped/failed (safe)", e?.message);
  }

  // Dropdown options
  await setDropdownOptions(extData.model, pageSku);

  // Multistate
  const ms = el(MULTISTATE_ID);
  const isNoModel =
    extData.model === "empty" ||
    extData.details === "empty" ||
    extData.primaryDesc === "empty";

  L("multistate decision", { isNoModel, multistateFound: !!ms });
  await ensureCorrectState(ms, isNoModel);

  // Fill content
  if (isNoModel) {
    if (el(DETAILS_ONLY_ID)) el(DETAILS_ONLY_ID).text = extData.defaultDesc;
    if (el(NO_MODEL_SKU_ID)) el(NO_MODEL_SKU_ID).text = `SKU: ${pageSku}`;
    if (el(NO_MODEL_PRICE_ID)) el(NO_MODEL_PRICE_ID).text = `Price: ${priceFormatted}` || "";
    if (el(NO_MODEL_OBS_ID)) el(NO_MODEL_OBS_ID).html = cythStockHtml
  } else {
    if (el(PAGE_NAME_ID)) el(PAGE_NAME_ID).text = extData.model || "";
    if (el(PRIMARY_DESC_ID)) el(PRIMARY_DESC_ID).text = extData.primaryDesc || "";
    if (el(SUBHEADER_ID)) el(SUBHEADER_ID).text = extData.details || "";
    if (el(OBS_MESSAGE_ID)) el(OBS_MESSAGE_ID).html = cythStockHtml
    if (el(MODEL_SKU_ID)) el(MODEL_SKU_ID).text = `SKU: ${pageSku}`;
    if (el(PRICE_ID)) el(PRICE_ID).text = `Price: ${priceFormatted}` || "";
  }

  // Enable/disable add-to-cart
  const addBtn = el(ADD_TO_CART_ID);
  if (addBtn) {
    if (extData.lifecycleStatus === "Obsolete") addBtn.disable?.();
    else addBtn.enable?.();
  }
}

// ================================
// Lifecycle
// ================================
$w.onReady(async () => {
  try {
    L("Studio Dynamic Product Page onReady", { url: wixLocationFrontend.url });

    logElementPresence("mustHave", [
      MULTISTATE_ID,
      OPTIONS_DROPDOWN_ID,
      ADD_TO_CART_ID,
      "#repeater1",
      "#repeater2"
    ]);

    wireDropdownNavigation();
    wireAddToCart();

    return setPageContentAndStates()
    .then(() => {
      /*  Fetch meta description from product SEO settings and set with setMetaTags  */
      const tag = pageData.seoData.tags.find(
        (t) => t.type === "meta" && t.props?.name === "description"
      );
      // console.log(pageData.seoData)
      return wixSeoFrontend.setMetaTags([tag.props])
    })
    .then(() => {
      const tag = pageData.seoData.tags.find(
        (t) => t.type === "title"
      );
      let titleText = tag.children
      return wixSeoFrontend.setTitle(titleText)
    })
    .then(() => {
  
      return getCurrentProductFromDataset();
    })
    .then(product => {
      return loadDocsForProduct(product?._id);

    })
    .then(() => {
      L("onReady complete");
    })
  } catch (err) {
    E("onReady failed", err);
  }
});
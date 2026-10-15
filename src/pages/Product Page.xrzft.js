import wixSeoFrontend from "wix-seo-frontend";
import wixStores from "wix-stores-frontend";
import wixLocation from "wix-location-frontend";
import wixData from "wix-data";
import { rendering } from "wix-window";
 
// ================================
// DIAG helpers
// ================================
const L = (tag, payload) =>
  payload !== undefined ? console.log(`[DIAG] ${tag}:`, payload) : console.log(`[DIAG] ${tag}`);
const W = (tag, payload) => console.warn(`[WARN] ${tag}:`, payload);
const E = (tag, err) => console.error(`[ERR] ${tag}:`, err);
 
// ================================
// PAGE CONFIG
// ================================
const ADD_TO_CART_ID = "#button968";
const ADD_TO_CART_ID2 = "#addToCartButton";
const OPTIONS_DROPDOWN_ID = "#options1";
const MULTISTATE_ID = "#statebox8";
 
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
 
const STORE_DESC_MODEL_ID = "#storeDescModel";
const STORE_DESC_NO_MODEL_ID = "#storeDescNoModel";
const LIFECYCLE_NO_MODEL_ID = "#lifecycleNoModel";
const LIFECYCLE_MODEL_ID = "#lifecycleModel";
const SUPPORT_INFO_ID = "#supportText";
const NO_MODEL_SUPPORT_INFO_ID = "#supportTextN";
 
// Competitor hover
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
const inStockText =
  '<p style="color: #008000;"><strong>Stock Status: In-Stock Ready-to-Ship';
const outOfStockText =
  '<p style="color: #000000;"><strong>Stock Status: Available to Order</strong></p> ';
const obsoleteText =
  '<p style="color: #FF0000;"><strong>Stock Status: OBSOLETE - CONTACT CYTH</strong></p>';
 
// ================================
// Product docs config
// Collection "Import913" (product_docs) stores one row per SKU with a
// "documents" field containing an array of wix:document:// URLs,
// uploaded by the sku-doc-uploader pipeline.
// ================================
const PRODUCT_DOCS_COLLECTION = "Import913";
const PRODUCT_SKU_FIELD = "sku";
const PRODUCT_DOCS_FIELD = "documents";
 
// ================================
// Collection IDs
// ================================
const PRODUCTS_EXTENDED_COLLECTION_ID = "Import910";
const PARTNER_INVENTORY_COLLECTION_ID = "Import912";
 
const MODEL_OPTIONS_MAX = 50;
const GALLERY_MAX_ITEMS = 12;
 
let currentProduct = null;
let docsWiredOnce = false;
 
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
 
function isBrowserRender() {
  return !rendering || rendering.env === "browser";
}
 
// ================================
// Product source of truth
// ================================
async function getCurrentProduct() {
  const product = await $w("#productPage1").getProduct();
 
  L("current product snapshot", {
    _id: product?._id,
    name: product?.name,
    sku: product?.sku,
    slug: product?.slug,
    formattedPrice: product?.formattedPrice,
    seoData: product?.seoData
  });
 
  return product;
}
 
// ================================
// Mini-cart helper
// ================================
function openSideCart() {
  try {
    let opened = false;
 
    try {
      $w("ShoppingCartIcon").forEach((icon) => {
        if (opened) return;
 
        if (typeof icon.openMiniCart === "function") {
          icon.openMiniCart();
          opened = true;
          return;
        }
 
        if (typeof icon.expandMiniCart === "function") {
          icon.expandMiniCart();
          opened = true;
          return;
        }
 
        if (typeof icon.expand === "function") {
          icon.expand();
          opened = true;
          return;
        }
 
        if (typeof icon.show === "function") {
          icon.show();
          opened = true;
          return;
        }
      });
    } catch (_) {}
 
    if (opened) return;
 
    if (typeof wixStores.cart.showMiniCart === "function") {
      wixStores.cart.showMiniCart();
      return;
    }
 
    if (typeof wixStores.cart.openCart === "function") {
      wixStores.cart.openCart();
      return;
    }
 
    wixLocation.to("/cart");
  } catch (e) {
    W("openSideCart failed", e?.message);
    wixLocation.to("/cart");
  }
}
 
// ================================
// Quantity helper
// ================================
function getRequestedQty() {
  try {
    // const q = $w("#qtyInput")?.value
    const n = 1;
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
      lifecycleStatus: "Contact Cyth For Life Cycle Status Information",
      supportInfo: undefined
    };
  }
 
  L("ProductsExtended snapshot", {
    sku: item.sku,
    model: item.model,
    details: item.details,
    primaryDesc: item.primaryDesc,
    lifecyclePhase: item.lifecyclePhase,
    optionIdentif: item.optionIdentif,
    supportInfo: item.supportInfo
  });
 
  return {
    sku: item.sku,
    model: item.model ?? "empty",
    details: item.details ?? "empty",
    primaryDesc: item.primaryDesc ?? "empty",
    defaultDesc: item.desc_original ?? "No Description",
    optionIdentif: item.optionIdentif ?? "",
    lifecycleStatus:
      item.lifecyclePhase ?? "Contact Cyth For Life Cycle Status Information",
    supportInfo: item.supportInfo
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
  if (!item) return null;
 
  const digikeyQty = Number(item.digikey_inventory ?? 0);
  const newarkQty = Number(item.newark_inventory ?? 0);
 
  return {
    digikey_price: item.digikey_price ?? "Not Listed",
    digikey_inventory: digikeyQty > 0 ? "In Stock" : "Out of Stock",
    newark_price: item.newark_price ?? "Not Listed",
    newark_inventory: newarkQty > 0 ? "In Stock" : "Out of Stock",
    main_stock: item.inStock
      ? inStockText + " as of " + item.last_updated
      : outOfStockText,
    simple_stock: item.inStock ? "In Stock" : "Out of Stock"
  };
}
 
// ================================
// Dropdown options + navigation
// Uses custom collection for sibling SKUs, then Stores/Products lookup
// only for selected option navigation.
// ================================

// Dropdown rule: shown only when the current SKU AND at least one other SKU
// share the same Model and BOTH have Model + OptionIdentif filled in.
// Rows with a blank OptionIdentif are left out of the dropdown entirely.
// Returns true only when the dropdown should be visible.
function hasText(v) {
  return v !== null && v !== undefined && String(v).trim() !== "" && String(v).trim() !== "empty";
}

async function setDropdownOptions(modelName, currentSku) {
  L("setDropdownOptions called", { modelName, currentSku });
  const dd = $w(OPTIONS_DROPDOWN_ID);
  if (!dd) { W("Dropdown not found", OPTIONS_DROPDOWN_ID); return false; }

  if (!hasText(modelName)) {
    L("dropdown collapsed (no model)", { modelName });
    dd.collapse();
    return false;
  }

  const results = await wixData
    .query(PRODUCTS_EXTENDED_COLLECTION_ID)
    .eq("model", modelName)
    .limit(MODEL_OPTIONS_MAX)
    .find();

  const items = results.items || [];
  const eligible = items.filter((i) => hasText(i.sku) && hasText(i.optionIdentif));
  const current = String(currentSku ?? "").trim();
  const currentItem = eligible.find((i) => String(i.sku).trim() === current);

  L("options query results", {
    modelName,
    count: items.length,
    eligible: eligible.length,
    currentHasOptionIdentif: !!currentItem
  });

  if (!currentItem || eligible.length < 2) {
    L("dropdown collapsed (needs current SKU + another SKU with OptionIdentif)", { modelName });
    dd.collapse();
    return false;
  }

  // If two SKUs share the same OptionIdentif, append the SKU so they can be told apart.
  const labelOf = (i) => String(i.optionIdentif).trim();
  const counts = {};
  eligible.forEach((i) => { counts[labelOf(i)] = (counts[labelOf(i)] || 0) + 1; });
  const toOption = (i) => ({
    label: counts[labelOf(i)] > 1 ? `${labelOf(i)} (${String(i.sku).trim()})` : labelOf(i),
    value: String(i.sku).trim()
  });

  const placeholder = toOption(currentItem).label;
  const dropdownOptions = eligible
    .filter((i) => String(i.sku).trim() !== current)
    .map(toOption);

  dd.placeholder = placeholder;
  dd.options = dropdownOptions;
  dd.expand();

  L("dropdown configured", {
    placeholder,
    options: dropdownOptions.length,
    collapsed: dd.collapsed,
    hidden: dd.hidden
  });

  return true;
}

// DROPDOWN SYNC FIX: identical logic on server (SSR) and browser render,
// so the server HTML and the browser agree. No SSR-only collapse, no timers.
async function prepareDropdownOnLoad(modelName, currentSku) {
  if (!$w(OPTIONS_DROPDOWN_ID)) { W("Dropdown not found", OPTIONS_DROPDOWN_ID); return; }

  L("prepareDropdownOnLoad", { env: rendering?.env, modelName, currentSku });

  let shouldShow = false;
  try {
    shouldShow = await setDropdownOptions(modelName, currentSku);
  } catch (e) {
    E("setDropdownOptions failed", e);
    $w(OPTIONS_DROPDOWN_ID).collapse();
  }

  const dd = $w(OPTIONS_DROPDOWN_ID);
  L("dropdown final", { env: rendering?.env, shouldShow, collapsed: dd.collapsed, hidden: dd.hidden });
}
 
function wireDropdownNavigation() {
  if (!$w(OPTIONS_DROPDOWN_ID)) return;
 
  $w(OPTIONS_DROPDOWN_ID).onChange(async () => {
    try {
      const sku = $w(OPTIONS_DROPDOWN_ID).value;
      L("dropdown change", { sku });
      if (!sku) return;
 
      const prodRes = await wixData
        .query("Stores/Products")
        .eq("sku", sku)
        .limit(1)
        .find();
 
      const prod = prodRes.items?.[0];
      if (!prod?.productPageUrl) {
        W("Stores/Products missing productPageUrl for sku", sku);
        return;
      }
 
      const parts = String(prod.productPageUrl).split("/");
      const slug = parts[2] || parts[parts.length - 1];
      const url = `${wixLocation.baseUrl}/product-page/${slug}`;
 
      L("navigating to selected option", { url, productPageUrl: prod.productPageUrl });
      wixLocation.to(url);
    } catch (e) {
      E("dropdown nav failed", e);
    }
  });
 
  L("dropdown wired", { id: OPTIONS_DROPDOWN_ID });
}
 
// ================================
// Multistate switching (VERIFIED)
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
 
async function ensureCorrectState(isNoModel) {
  const ms = $w(MULTISTATE_ID);
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
// Product Docs
// Documents are stored in CMS collection "product_docs" (Import913) as an array
// of wix:document:// URLs, one row per SKU, uploaded by the sku-doc-uploader pipeline.
// ================================
 
// Converts a wix:document:// URL + model name to a human-readable label.
// URL format: wix:document://v1/<hash>/<percent-encoded-filename>
// File naming convention: <model>_<doctype>.pdf  → display as "<Model> <Doctype>"
// Strips the model prefix from doctype before re-prepending to avoid doubling
// (e.g. "cDAQ-9178 Specifications.pdf" → "cDAQ-9178 Specifications", not "cDAQ-9178 cDAQ-9178 Specifications").
function parseDocDisplayName(wixUrl, model) {
  if (!wixUrl || typeof wixUrl !== "string") return "Document";
  try {
    const parts = wixUrl.split("/");
    const encoded = parts[parts.length - 1] ?? "";
    const filename = decodeURIComponent(encoded).replace(/\.pdf$/i, "");
 
    const underscoreIdx = filename.indexOf("_");
    let doctype = underscoreIdx !== -1 ? filename.slice(underscoreIdx + 1) : filename;
 
    const safeModel = (model && model !== "empty") ? model : "";
    if (safeModel && doctype.toLowerCase().startsWith(safeModel.toLowerCase())) {
      doctype = doctype.slice(safeModel.length).replace(/^[\s_-]+/, "");
    }
 
    const label = doctype
      .split(/[\s_]+/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
    return safeModel ? `${safeModel} ${label}` : label;
  } catch (_) {
    return "Document";
  }
}
 
function setRepeaterVisibility(repeater, hasItems) {
  if (!repeater) return;
  if (hasItems) repeater.show?.();
  else repeater.hide?.();
}
 
function wireDocsRepeatersOnce() {
  if (docsWiredOnce) return;
  if (!$w("#repeater2")) return;
 
  // repeater1 replaced with spec table. Will be implemented in future
 
  $w("#repeater2").onItemReady(($item, itemData) => {
    $item("#fileName").text = itemData.displayName || "";
    $item("#downloadButton").onClick(() => {
      if (itemData.fileUrl) wixLocation.to(itemData.fileUrl);
    });
  });
 
  docsWiredOnce = true;
  L("Docs repeater wired once");
}
 
async function loadDocsForProduct(pageSku, model) {
  const repeater2 = $w("#repeater2");
 
  if (!repeater2) {
    W("Docs repeater missing (#repeater2).");
    return;
  }
 
  if (!pageSku) {
    W("loadDocsForProduct: missing pageSku");
    return;
  }
 
  if (!isBrowserRender()) return;
 
  wireDocsRepeatersOnce();
 
  repeater2.data = [];
  repeater2.hide();
 
  L("loadDocsForProduct query", { collection: PRODUCT_DOCS_COLLECTION, sku: pageSku });
 
  let res;
  try {
    res = await wixData
      .query(PRODUCT_DOCS_COLLECTION)
      .eq(PRODUCT_SKU_FIELD, pageSku)
      .find();
  } catch (e) {
    W("loadDocsForProduct query failed", e?.message);
    return;
  }
 
  L("loadDocsForProduct query result", { totalCount: res?.totalCount, itemCount: res?.items?.length });
 
  const row = res?.items?.[0];
  if (!row) {
    W("loadDocsForProduct: no product_docs entry for sku", pageSku);
    return;
  }
 
  const rawDocs = row[PRODUCT_DOCS_FIELD];
  L("loadDocsForProduct raw documents field", { type: typeof rawDocs, isArray: Array.isArray(rawDocs), value: rawDocs });
 
  if (!rawDocs || !Array.isArray(rawDocs) || rawDocs.length === 0) {
    W("loadDocsForProduct: documents field empty or missing for sku", pageSku);
    return;
  }
 
  const flatDocs = rawDocs
    .filter((url) => url && typeof url === "string")
    .map((url, idx) => ({
      _id: `doc-${idx}`,
      fileUrl: url,
      displayName: parseDocDisplayName(url, model)
    }));
 
  L("loadDocsForProduct parsed", { count: flatDocs.length, sample: flatDocs[0] });
 
  repeater2.data = flatDocs;
  setRepeaterVisibility(repeater2, flatDocs.length > 0);
 
  L("docs bound", { docCount: flatDocs.length });
}
 
// ================================
// Add to cart
// ================================
function wireAddToCart(productId) {
  const btn1 = $w(ADD_TO_CART_ID);
  const btn2 = $w(ADD_TO_CART_ID2);
 
  if (!btn1 && !btn2) {
    W("Add to cart buttons not found", { ADD_TO_CART_ID, ADD_TO_CART_ID2 });
    return;
  }
 
  if (btn1) {
    btn1.onClick(async () => {
      try {
        btn1.disable();
 
        const qty = getRequestedQty();
        if (!productId) {
          W("No productId; cannot add to cart");
          return;
        }
 
        await wixStores.cart.addProducts([{ productId, quantity: qty }]);
        L("added to cart", { productId, quantity: qty, buttonId: ADD_TO_CART_ID });
 
        openSideCart();
      } catch (e) {
        E("addToCart handler", e);
      } finally {
        try {
          btn1.enable();
        } catch (_) {}
      }
    });
 
    L("Add-to-cart wired", { id: ADD_TO_CART_ID });
  }
 
  if (btn2) {
    btn2.onClick(async () => {
      try {
        btn2.disable();
 
        const qty = getRequestedQty();
        if (!productId) {
          W("No productId; cannot add to cart");
          return;
        }
 
        await wixStores.cart.addProducts([{ productId, quantity: qty }]);
        L("added to cart", { productId, quantity: qty, buttonId: ADD_TO_CART_ID2 });
 
        openSideCart();
      } catch (e) {
        E("addToCart handler", e);
      } finally {
        try {
          btn2.enable();
        } catch (_) {}
      }
    });
 
    L("Add-to-cart wired", { id: ADD_TO_CART_ID2 });
  }
}
 
// ================================
// Competitor hover
// ================================
function wireCompetitorHover() {
  if (!$w(COMP_BUTTON_ID) || !$w(COMP_BOX_ID)) return;
 
  $w(COMP_BUTTON_ID).onMouseIn(() => {
    $w(COMP_BOX_ID).show("fade", { duration: 300 });
  });
 
  $w(COMP_BUTTON_ID).onMouseOut(() => {
    $w(COMP_BOX_ID).hide("fade", { duration: 300 });
  });
 
  L("competitor hover wired", { button: COMP_BUTTON_ID, box: COMP_BOX_ID });
}
 
// ================================
// SEO
// ================================
async function applySeo(product) {
  const tags = product?.seoData?.tags || [];
 
  const metaTag = tags.find(
    (t) => t.type === "meta" && t.props?.name === "description"
  );
 
  if (metaTag?.props) {
    await wixSeoFrontend.setMetaTags([metaTag.props]);
  }
 
  const titleTag = tags.find((t) => t.type === "title");
  if (titleTag?.children) {
    await wixSeoFrontend.setTitle(titleTag.children);
  }
 
  L("SEO applied", { hasMeta: !!metaTag, hasTitle: !!titleTag });
}
 
// ================================
// Page content
// ================================
async function setPageContentAndStates(product, extData, inventoryData) {
  const pageSku = product?.sku;
  const priceFormatted = product?.formattedPrice;
 
  if (!pageSku) {
    W("No sku on product; cannot setPageContentAndStates");
    return;
  }
 
  const storeDescRaw = product?.description ?? "";
  const storeDescHtml = product?.descriptionHtml ?? "";
  const storeDescText = String(storeDescRaw || "");
  const descForHtml = String(storeDescHtml || storeDescRaw || "");
 
  // BUG 2 FIX: layout depends on the model only. A missing details/primaryDesc
  // no longer forces the no-model layout (which has no dropdown), so every SKU
  // listed in a model's dropdown lands on the model layout.
  const isNoModel =
    !extData.model ||
    String(extData.model).trim() === "" ||
    extData.model === "empty";
  L("model decision inputs", {
    model: extData.model,
    details: extData.details,
    primaryDesc: extData.primaryDesc,
    isNoModel
  });
 
  const descTargetId = isNoModel ? STORE_DESC_NO_MODEL_ID : STORE_DESC_MODEL_ID;
  if ($w(descTargetId)) {
    if ("html" in $w(descTargetId) && descForHtml) {
      $w(descTargetId).html = descForHtml;
    } else {
      $w(descTargetId).text = storeDescText;
    }
  }
 
  if ($w(PREHEADER_ID)) {
    $w(PREHEADER_ID).text =
      !isNoModel
        ? `${extData.model} | ${extData.sku}`
        : `${extData.sku}`;
  }
 
  if ($w("#imageX2")) {
    $w("#imageX2").alt = $w(PREHEADER_ID)?.text || "";
 
    if (product?.mainMedia) {
      $w("#imageX2").src = product.mainMedia;
      $w("#imageX2").alt = product.name || product.sku || "";
    }
  }
 
  const mediaItems = product?.mediaItems || product?.productMedia || [];
  if ($w("#gallery1") && Array.isArray(mediaItems)) {
    $w("#gallery1").items = mediaItems
      .slice(0, GALLERY_MAX_ITEMS)
      .map((item) => ({
        type: "image",
        src: item.src || item.url || item.image,
        title: item.title || product.name || "",
        description: item.description || ""
      }))
      .filter((x) => x.src);
  }
 
  if ($w(LIFECYCLE_MODEL_ID)) {
    $w(LIFECYCLE_MODEL_ID).text = `Lifecycle: ${extData.lifecycleStatus}`;
    if (extData.lifecycleStatus !== "Obsolete") {
      $w(LIFECYCLE_MODEL_ID).style.color = "green";
    }
    else {
      $w(ADD_TO_CART_ID).disable();
      $w(ADD_TO_CART_ID2).disable();
      $w(ADD_TO_CART_ID).label = "No Longer Manufactured";
      $w(ADD_TO_CART_ID2).label = "No Longer Manufactured";
    }
  }
 
  if ($w(LIFECYCLE_NO_MODEL_ID)) {
    $w(LIFECYCLE_NO_MODEL_ID).text = `Lifecycle: ${extData.lifecycleStatus}`;
    if (extData.lifecycleStatus !== "Obsolete") {
      $w(LIFECYCLE_NO_MODEL_ID).style.color = "green";
    }
    else {
      $w(ADD_TO_CART_ID).disable();
      $w(ADD_TO_CART_ID2).disable();
      $w(ADD_TO_CART_ID).label = "No Longer Manufactured";
      $w(ADD_TO_CART_ID2).label = "No Longer Manufactured";
    }
  }
 
  if ($w(SUPPORT_INFO_ID)) {
    $w(SUPPORT_INFO_ID).text = extData.supportInfo ?? "";
  }
  if ($w(NO_MODEL_SUPPORT_INFO_ID)) {
    $w(NO_MODEL_SUPPORT_INFO_ID).text = extData.supportInfo ?? "";
  }
 
  let cythStockHtml = outOfStockText;
 
  if (inventoryData) {
    cythStockHtml =
      extData.lifecycleStatus !== "Obsolete"
        ? inventoryData.main_stock
        : obsoleteText;
 
    if ($w(DK_PRICE_ID)) $w(DK_PRICE_ID).text = "$" + inventoryData.digikey_price;
    if ($w(DK_STOCK_ID)) $w(DK_STOCK_ID).text = inventoryData.digikey_inventory;
    if ($w(NW_PRICE_ID)) $w(NW_PRICE_ID).text = "$" + inventoryData.newark_price;
    if ($w(NW_STOCK_ID)) $w(NW_STOCK_ID).text = inventoryData.newark_inventory;
    if ($w(NI_PRICE_ID)) $w(NI_PRICE_ID).text = "$0.00";
    if ($w(CYTH_PRICE_ID)) $w(CYTH_PRICE_ID).text = priceFormatted || "";
    if ($w(CYTH_STOCK_ID)) $w(CYTH_STOCK_ID).text = inventoryData.simple_stock;
  }
 
  // Switch multistate first so the dropdown lives in an active panel
  // before expand() is called — changeState resets child element states.
  L("multistate decision", { isNoModel });
  await ensureCorrectState(isNoModel);
 
  if (isNoModel) {
    if ($w(DETAILS_ONLY_ID)) $w(DETAILS_ONLY_ID).text = extData.defaultDesc;
    if ($w(NO_MODEL_SKU_ID)) $w(NO_MODEL_SKU_ID).text = `SKU: ${pageSku}`;
    if ($w(NO_MODEL_PRICE_ID)) $w(NO_MODEL_PRICE_ID).text = `Price: ${priceFormatted || ""}`;
    if ($w(NO_MODEL_OBS_ID)) $w(NO_MODEL_OBS_ID).html = cythStockHtml;
  } else {
    if ($w(PAGE_NAME_ID)) $w(PAGE_NAME_ID).text = extData.model || "";
    // BUG 2 FIX: show blank instead of the literal "empty" when a field is missing.
    if ($w(PRIMARY_DESC_ID)) $w(PRIMARY_DESC_ID).text = extData.primaryDesc === "empty" ? "" : (extData.primaryDesc || "");
    if ($w(SUBHEADER_ID)) $w(SUBHEADER_ID).text = extData.details === "empty" ? "" : (extData.details || "");
    if ($w(OBS_MESSAGE_ID)) $w(OBS_MESSAGE_ID).html = cythStockHtml;
    if ($w(MODEL_SKU_ID)) $w(MODEL_SKU_ID).text = `SKU: ${pageSku}`;
    if ($w(PRICE_ID)) $w(PRICE_ID).text = `Price: ${priceFormatted || ""}`;
  }
 
  if ($w(ADD_TO_CART_ID)) {
    if (extData.lifecycleStatus === "Obsolete") {
      $w(ADD_TO_CART_ID).disable();
    } else {
      $w(ADD_TO_CART_ID).enable();
    }
  }
}
 
// ================================
// Lifecycle
// ================================
$w.onReady(async () => {
  try {
    L("Product Page onReady", { url: wixLocation.url });
 
    logElementPresence("mustHave", [
      MULTISTATE_ID,
      OPTIONS_DROPDOWN_ID,
      ADD_TO_CART_ID,
      ADD_TO_CART_ID2,
      "#repeater2"
    ]);
 
    currentProduct = await getCurrentProduct();
    if (!currentProduct?.sku) {
      W("No sku on current product; aborting onReady");
      return;
    }
 
    wireDropdownNavigation();
    wireCompetitorHover();
    wireAddToCart(currentProduct._id);
 
    const [extData, inventoryData] = await Promise.all([
      getExtendedProductData(currentProduct.sku),
      getPartnerInventoryData(currentProduct.sku)
    ]);
 
    await setPageContentAndStates(currentProduct, extData, inventoryData);
    // Expand the dropdown after setPageContentAndStates fully resolves so the
    // multistate switch (changeState) can't reset the child expand state.
    await prepareDropdownOnLoad(extData.model, currentProduct.sku);
    await applySeo(currentProduct);
    await loadDocsForProduct(extData.sku, extData.model);

    L("onReady complete");
  } catch (e) {
    E("onReady failed", e);
  }
});

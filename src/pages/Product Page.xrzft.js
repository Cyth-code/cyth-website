import wixSeoFrontend from "wix-seo-frontend";
import wixStores from "wix-stores-frontend";
import wixLocation from "wix-location-frontend";
import wixData from "wix-data";

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

let currentProduct = null;
let docsWiredOnce = false;

// ================================
// Product source of truth
// ================================
async function getCurrentProduct() {
  return $w("#productPage1").getProduct();
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
  const res = await wixData
    .query(PRODUCTS_EXTENDED_COLLECTION_ID)
    .eq("sku", pageSku)
    .limit(1)
    .find();

  const item = res.items?.[0];

  if (!item) {
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

  return {
    sku: item.sku,
    model: item.model ?? "empty",
    details: item.details ?? "empty",
    primaryDesc: item.primaryDesc ?? "empty",
    defaultDesc: item.desc_original ?? "No Description",
    optionIdentif: item.optionIdentif ?? "",
    lifecycleStatus:
      item.lifecyclePhase ?? "Contact Cyth For Life Cycle Status Information"
  };
}

async function getPartnerInventoryData(pageSku) {
  const res = await wixData
    .query(PARTNER_INVENTORY_COLLECTION_ID)
    .eq("sku", pageSku)
    .limit(1)
    .find();

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
async function setDropdownOptions(modelName, currentSku) {
  if (!$w(OPTIONS_DROPDOWN_ID)) return;

  if (!modelName || modelName === "empty") {
    $w(OPTIONS_DROPDOWN_ID).collapse();
    return;
  }

  const results = await wixData
    .query(PRODUCTS_EXTENDED_COLLECTION_ID)
    .contains("model", modelName)
    .limit(1000)
    .find();

  const items = results.items || [];

  if (items.length <= 1) {
    $w(OPTIONS_DROPDOWN_ID).collapse();
    return;
  }

  $w(OPTIONS_DROPDOWN_ID).expand();

  const dropdownOptions = items.map((item) => ({
    label: item.optionIdentif ?? "No Modifications",
    value: item.sku
  }));

  let pageOptionIndex = 0;
  for (let i = 0; i < dropdownOptions.length; i++) {
    if (dropdownOptions[i].value === currentSku) {
      pageOptionIndex = i;
      break;
    }
  }

  $w(OPTIONS_DROPDOWN_ID).placeholder =
    dropdownOptions[pageOptionIndex]?.label || "Select Option";

  dropdownOptions.splice(pageOptionIndex, 1);
  $w(OPTIONS_DROPDOWN_ID).options = dropdownOptions;
}

function wireDropdownNavigation() {
  if (!$w(OPTIONS_DROPDOWN_ID)) return;

  $w(OPTIONS_DROPDOWN_ID).onChange(async () => {
    try {
      const sku = $w(OPTIONS_DROPDOWN_ID).value;
      if (!sku) return;

      const prodRes = await wixData
        .query("Stores/Products")
        .eq("sku", sku)
        .limit(1)
        .find();

      const prod = prodRes.items?.[0];
      if (!prod?.productPageUrl) return;

      const parts = String(prod.productPageUrl).split("/");
      const slug = parts[2] || parts[parts.length - 1];
      wixLocation.to(`${wixLocation.baseUrl}/product-page/${slug}`);
      // wixLocation.
    } catch (e) {
      console.error("dropdown nav failed", e);
    }
  });
}

// ================================
// Multistate switching
// ================================
async function ensureCorrectState(isNoModel) {
  if (!$w(MULTISTATE_ID)) return;

  const target = isNoModel ? STATE_NO_MODEL : STATE_MODEL;

  try {
    await $w(MULTISTATE_ID).changeState(target);
  } catch (e) {
    console.error("multistate switch failed", e);
  }
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

    if (
      (s.startsWith("[") && s.endsWith("]")) ||
      (s.startsWith("{") && s.endsWith("}"))
    ) {
      try {
        return normalizeDoc(JSON.parse(s), fallbackLabel);
      } catch (_) {}
    }

    return { displayName: fallbackLabel, fileUrl: s };
  }

  if (typeof value === "object") {
    const displayName =
      value.name || value.fileName || value.originalFileName || fallbackLabel;
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

function wireDocsRepeatersOnce() {
  if (docsWiredOnce) return;
  if (!$w("#repeater1") || !$w("#repeater2")) return;

  $w("#repeater1").onItemReady(($item, itemData) => {
    $item("#filename1").text = itemData.displayName || "";
    $item("#downloadButton1").onClick(() => {
      if (itemData.fileUrl) wixLocation.to(itemData.fileUrl);
    });
  });

  $w("#repeater2").onItemReady(($item, itemData) => {
    $item("#fileName").text = itemData.displayName || "";
    $item("#downloadButton").onClick(() => {
      if (itemData.fileUrl) wixLocation.to(itemData.fileUrl);
    });
  });

  docsWiredOnce = true;
}

async function loadDocsForProduct(productId) {
  if (!$w("#repeater1") || !$w("#repeater2")) return;
  if (!productId) return;

  wireDocsRepeatersOnce();

  $w("#repeater1").data = [];
  $w("#repeater2").data = [];
  $w("#repeater1").hide();
  $w("#repeater2").hide();

  const res = await wixData
    .query(PRODUCT_DOCS_COLLECTION)
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

  $w("#repeater1").data = specDoc ? [specDoc] : [];
  $w("#repeater2").data = otherDocs;

  if ($w("#repeater1").data.length > 0) $w("#repeater1").show();
  if ($w("#repeater2").data.length > 0) $w("#repeater2").show();
}

// ================================
// Add to cart
// ================================
function wireAddToCart(productId) {
  if (!$w(ADD_TO_CART_ID) && !$w(ADD_TO_CART_ID2)) return;

  $w(ADD_TO_CART_ID).onClick(async () => {
    try {
      $w(ADD_TO_CART_ID).disable();

      const qty = getRequestedQty();
      if (!productId) return;

      await wixStores.cart.addProducts([{ productId, quantity: qty }]);
      openSideCart();
    } catch (e) {
      console.error("addToCart handler", e);
    } finally {
      try {
        $w(ADD_TO_CART_ID).enable();
      } catch (_) {}
    }
  });
  $w(ADD_TO_CART_ID2).onClick(async () => {
    try {
      $w(ADD_TO_CART_ID2).disable();

      const qty = getRequestedQty();
      if (!productId) return;

      await wixStores.cart.addProducts([{ productId, quantity: qty }]);
      openSideCart();
    } catch (e) {
      console.error("addToCart handler", e);
    } finally {
      try {
        $w(ADD_TO_CART_ID2).enable();
      } catch (_) {}
    }
  });
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
}

// ================================
// Page content
// ================================
async function setPageContentAndStates(product, extData, inventoryData) {
  const pageSku = product?.sku;
  const priceFormatted = product?.formattedPrice;

  if (!pageSku) return;

  const storeDescRaw = product?.description ?? "";
  const storeDescHtml = product?.descriptionHtml ?? "";
  const storeDescText = String(storeDescRaw || "");
  const descForHtml = String(storeDescHtml || storeDescRaw || "");

  if ($w(STORE_DESC_MODEL_ID)) {
    if ("html" in $w(STORE_DESC_MODEL_ID) && descForHtml) {
      $w(STORE_DESC_MODEL_ID).html = descForHtml;
    } else {
      $w(STORE_DESC_MODEL_ID).text = storeDescText;
    }
  }

  if ($w(STORE_DESC_NO_MODEL_ID)) {
    if ("html" in $w(STORE_DESC_NO_MODEL_ID) && descForHtml) {
      $w(STORE_DESC_NO_MODEL_ID).html = descForHtml;
    } else {
      $w(STORE_DESC_NO_MODEL_ID).text = storeDescText;
    }
  }

  if ($w(PREHEADER_ID)) {
    $w(PREHEADER_ID).text =
      extData.model !== "empty" && extData.model !== ""
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
  }

  if ($w(LIFECYCLE_NO_MODEL_ID)) {
    $w(LIFECYCLE_NO_MODEL_ID).text = `Lifecycle: ${extData.lifecycleStatus}`;
    if (extData.lifecycleStatus !== "Obsolete") {
      $w(LIFECYCLE_NO_MODEL_ID).style.color = "green";
    }
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

  await setDropdownOptions(extData.model, pageSku);

  const isNoModel =
    extData.model === "empty" ||
    extData.details === "empty" ||
    extData.primaryDesc === "empty";

  await ensureCorrectState(isNoModel);

  if (isNoModel) {
    if ($w(DETAILS_ONLY_ID)) $w(DETAILS_ONLY_ID).text = extData.defaultDesc;
    if ($w(NO_MODEL_SKU_ID)) $w(NO_MODEL_SKU_ID).text = `SKU: ${pageSku}`;
    if ($w(NO_MODEL_PRICE_ID)) $w(NO_MODEL_PRICE_ID).text = `Price: ${priceFormatted || ""}`;
    if ($w(NO_MODEL_OBS_ID)) $w(NO_MODEL_OBS_ID).html = cythStockHtml;
  } else {
    if ($w(PAGE_NAME_ID)) $w(PAGE_NAME_ID).text = extData.model || "";
    if ($w(PRIMARY_DESC_ID)) $w(PRIMARY_DESC_ID).text = extData.primaryDesc || "";
    if ($w(SUBHEADER_ID)) $w(SUBHEADER_ID).text = extData.details || "";
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
    currentProduct = await getCurrentProduct();
    if (!currentProduct?.sku) return;

    wireDropdownNavigation();
    wireCompetitorHover();
    wireAddToCart(currentProduct._id);

    const [extData, inventoryData] = await Promise.all([
      getExtendedProductData(currentProduct.sku),
      getPartnerInventoryData(currentProduct.sku)
    ]);

    await setPageContentAndStates(currentProduct, extData, inventoryData);
    await applySeo(currentProduct);
    await loadDocsForProduct(currentProduct._id);
  } catch (e) {
    console.error("onReady failed", e);
  }
});
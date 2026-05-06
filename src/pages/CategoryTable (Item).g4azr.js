import { buildMenuMap, getCatPageProducts } from 'backend/category_menu.web';
import wixLocationFrontend from 'wix-location-frontend';
import { local } from 'wix-storage-frontend';
import wixData from 'wix-data';

const STORES_PRODUCT_PREFIX = '/product-page/';
const CANDIDATE_COLLECTIONS = [
  'Stores/Products',
  'Products',
  'Products-2',
];

let menuMap = [];
let menuById = new Map();
let menuRepeater;
let breadcrumbs;
let initialItem;
let breadcrumbsData = [];
const linkCache = new Map();

function safeSetImage(imgEl, value) {
  if (!imgEl) return;

  const isValid =
    typeof value === 'string' &&
    (
      value.startsWith('http://') ||
      value.startsWith('https://') ||
      value.startsWith('wix:image://')
    );

  if (isValid) {
    imgEl.src = value;
    imgEl.show?.();
  } else {
    imgEl.hide?.();
  }
}

function getMenuMappedItem(itemIn) {
  if (!itemIn) return null;

  if (itemIn._id && menuById.has(itemIn._id)) {
    return menuById.get(itemIn._id);
  }

  return menuMap.find(item => item.name === itemIn?.name) || null;
}

function getResolvedChildren(item) {
  const resolved = [];
  const nodeId = item?._id;
  if (!nodeId) return resolved;

  const node = menuById.get(nodeId) || item;
  const childIds = Array.isArray(node?.children) ? node.children : [];

  for (const childId of childIds) {
    if (childId === nodeId) continue;
    const found = menuById.get(childId);
    if (found) resolved.push(found);
  }

  return resolved;
}

function slugify(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function looksLikeSlug(s) {
  const cleaned = String(s || '')
    .trim()
    .replace(/^\/(product-page|products)\//, '');

  return /^[a-z0-9-]+$/i.test(cleaned);
}

function normalizeToStoresProductUrl(raw) {
  if (!raw) return null;
  const s = String(raw).trim();

  if (/^(https?:|wix:)/i.test(s)) return s;

  if (s.startsWith('/products/')) {
    const slug = s.replace(/^\/products\//, '');
    return looksLikeSlug(slug) ? s : null;
  }

  if (s.startsWith('/product-page/')) {
    const slug = s.replace(/^\/product-page\//, '');
    return looksLikeSlug(slug) ? `/products/${slug}` : null;
  }

  if (looksLikeSlug(s)) return `/products/${s}`;

  return null;
}

function buildFallbackLink(item) {
  const modelSlug = item?.model ? slugify(item.model) : '';
  const skuSlug = item?.sku ? slugify(item.sku) : '';

  if (modelSlug && skuSlug) return `${STORES_PRODUCT_PREFIX}${modelSlug}-${skuSlug}`;
  if (modelSlug) return `${STORES_PRODUCT_PREFIX}${modelSlug}`;
  if (skuSlug) return `${STORES_PRODUCT_PREFIX}${skuSlug}`;

  return null;
}

function deriveProductLink(item) {
  if (!item || typeof item !== 'object') return null;

  const candidates = [
    item.productPageUrl,
    item.productUrl,
    item.url,
    item.href,
    item.link,
    item.linkUrl,
    item.pageUrl,
    item.slug,
    item.urlPart,
    item.seoSlug,
    item.handle,
    item['link-products-slug'],
    item['link-products-2-slug'],
    item['link-products-3-slug'],
    item['link-products'],
    item['link-products-2'],
    item['link-products-3'],
    item.linkProducts,
    item.product_link
  ];

  for (const candidate of candidates) {
    const normalized = normalizeToStoresProductUrl(candidate);
    if (normalized) return normalized;
  }

  return null;
}

async function queryFirst(collection, field, value) {
  try {
    const res = await wixData.query(collection).eq(field, value).limit(1).find();
    return res.items?.[0] || null;
  } catch {
    return null;
  }
}

async function resolveLinkOnDemand(item) {
  try {
    const key = item?.sku || item?.model || item?.name;
    if (!key) return null;

    if (linkCache.has(key)) {
      return linkCache.get(key);
    }

    const tryFields = [
      { f: 'sku', v: item?.sku },
      { f: 'name', v: item?.name },
      { f: 'name', v: item?.model }
    ].filter(t => typeof t.v === 'string' && t.v.trim());

    for (const collection of CANDIDATE_COLLECTIONS) {
      for (const fieldTry of tryFields) {
        const p = await queryFirst(collection, fieldTry.f, fieldTry.v);
        if (!p) continue;

        const byProductPageUrl = normalizeToStoresProductUrl(p.productPageUrl);
        if (byProductPageUrl) {
          linkCache.set(key, byProductPageUrl);
          return byProductPageUrl;
        }

        const slug = p.slug || p.urlPart || p.seoSlug || p.handle;
        if (slug) {
          const url = normalizeToStoresProductUrl(slug);
          if (url) {
            linkCache.set(key, url);
            return url;
          }
        }

        const direct = normalizeToStoresProductUrl(
          p.productUrl ||
          p.url ||
          p.href ||
          p['link-products-slug'] ||
          p['link-products-2-slug'] ||
          p['link-products-3-slug']
        );

        if (direct) {
          linkCache.set(key, direct);
          return direct;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

function isBlank(v) {
  if (v === undefined || v === null) return true;

  const s = String(v).trim();
  if (!s) return true;

  return ['n/a', 'na', 'none', 'null', 'empty', 'not listed'].includes(s.toLowerCase());
}

function textOrHide($item, selector, value) {
  const el = $item(selector);
  if (!el) return;

  if (isBlank(value)) {
    el.hide?.();
    return;
  }

  if ('text' in el) {
    el.text = String(value);
  }

  el.show?.();
}

async function pageSetup(anyItem) {
  if (!anyItem) return;

  const currentItem = getMenuMappedItem(anyItem) || anyItem;
  const stateBox = $w('#changeBox');
  const childCount = Array.isArray(currentItem?.children) ? currentItem.children.length : 0;
  const isLeaf = childCount === 0;

  await stateBox.changeState(isLeaf ? 'leaf' : 'parent');

  const pageTitle = $w('#pageTitle');
  const pageImage = $w('#pageImage');
  const pageLongDesc = $w('#pageLongDesc');

  pageTitle.text = currentItem.name === 'root' ? 'Shop Categories' : (currentItem.name || '');
  safeSetImage(pageImage, currentItem.image);
  pageLongDesc.text =
    currentItem.desc_long ?? `Description field is empty for item ${currentItem.name || ''}`;

  if (isLeaf) {
    await productsSetup(currentItem);
  } else {
    subCatSetup(currentItem);
  }

  menuSetup(currentItem);
}

async function productsSetup(currentItem) {
  const productsRepeater = $w('#productsRepeater');

  productsRepeater.onItemReady(($item, itemData) => {
    const ribbon = $item('#productRepeaterRibbon');
    if (ribbon) {
      ribbon.text = '';
      ribbon.hide?.();
    }

    const isObsolete = itemData.lifecyclePhase === 'Obsolete';
    const isInStock =
      itemData.isInStock === true ||
      itemData.inStock === true ||
      Number(itemData.quantityInStock) > 0;

    const addButton = $item('#productRepeaterAddButton');

    if (isObsolete) {
      addButton?.disable?.();
      try {
        addButton.label = 'No Longer Manufactured';
      } catch {}

      if (ribbon) {
        ribbon.text = 'No Longer Manufactured';
        ribbon.show?.();
      }
    } else if (isInStock) {
      if (ribbon) {
        ribbon.text = 'In Stock';
        ribbon.show?.();
      }
      addButton?.enable?.();
      try {
        addButton.label = 'View';
      } catch {}
    }
    console.log(itemData);

    if (isBlank(itemData.model)) {
      textOrHide($item, '#secondaryProdText', itemData.details);
      $item('#productRepeaterName')?.hide?.();
      textOrHide($item, '#productRepeaterDetails', itemData.primaryDesc);
    } else {
      textOrHide($item, '#productRepeaterName', itemData.model);
      if(isBlank(itemData.details)) {
        textOrHide($item, '#productRepeaterDetails', itemData.primaryDesc);
      } else {
        textOrHide($item, '#productRepeaterDetails', itemData.details);
      }
      $item('#secondaryProdText')?.hide?.();
    }

    textOrHide($item, '#productsRepeaterPrice', itemData.formattedPrice);
    textOrHide($item, '#productRepeaterSku', itemData.sku);
    safeSetImage($item('#productRepeaterImage'), itemData.mainMedia);

    let link = deriveProductLink(itemData);

    const navigate = async () => {
      if (!link) link = await resolveLinkOnDemand(itemData);
      if (!link) link = buildFallbackLink(itemData);

      const finalUrl = normalizeToStoresProductUrl(link);
      if (finalUrl) {
        wixLocationFrontend.to(finalUrl);
      }
    };

    [
      '#productRepeaterAddButton',
      '#productGoToBox',
      '#productRepeaterImage',
      '#productRepeaterName'
    ].forEach(selector => {
      const el = $item(selector);
      if (el) {
        el.onClick(navigate);
      }
    });
  });

  const productsData = await getCatPageProducts(currentItem);
  const safeProducts = Array.isArray(productsData) ? productsData : [];
  const emptyState = $w('#emptyProductsState');

  if (safeProducts.length === 0) {
    emptyState?.show?.();
  } else {
    emptyState?.hide?.();
  }

  productsRepeater.data = safeProducts;
  updateProdFilter(safeProducts);
}

function subCatSetup(currentItem) {
  const subCatRepeater = $w('#subCatRepeater');

  subCatRepeater.onItemReady(($item, itemData) => {
    const subCatBox = $item('#subCatBox');
    const subCatName = $item('#subCatName');
    const subCatText = $item('#subCatText');
    const subCatImage = $item('#subCatImage');

    if (subCatBox) {
      subCatBox.onClick(() => {
        if (itemData.url) wixLocationFrontend.to(itemData.url);
      });
    }

    if (subCatName) subCatName.text = itemData.name || '';
    if (subCatText) subCatText.html = itemData.desc_short || '';
    safeSetImage(subCatImage, itemData.image);
  });

  subCatRepeater.data = getResolvedChildren(currentItem);
}

function updateProdFilter(productsData) {
  const productsRepeater = $w('#productsRepeater');
  const off = $w('#obsCheckOn');
  const on = $w('#obsCheckOff');

  const stored = local.getItem('obsolete_on') ?? 'false';

  const showAll = () => {
    off?.hide?.();
    on?.show?.();
    local.setItem('obsolete_on', 'false');
    productsRepeater.data = productsData;
  };

  const hideObsolete = () => {
    on?.hide?.();
    off?.show?.();
    local.setItem('obsolete_on', 'true');
    productsRepeater.data = productsData.filter(p => p.lifecyclePhase !== 'Obsolete');
  };

  if (stored === 'true') {
    hideObsolete();
  } else {
    showAll();
  }

  off?.onClick(showAll);
  on?.onClick(hideObsolete);
}

function menuSetup(currentItem) {
  const root = menuMap.find(i => i.name === 'root');

  if (!root) {
    menuRepeater.data = [];
    return;
  }

  const top = getResolvedChildren(root);

  menuRepeater.data = top.map((child, idx) => ({
    _id: `${child._id}-top-${idx}`,
    nodeId: child._id,
    name: child.name,
    level: 1,
    children: child.children ?? [],
    mapped: child.mapped === false ? false : true,
    desc_long: child.desc_long,
    desc_short: child.desc_short,
    image: child.image,
    url: child.url
  }));

  expandInitialItem(currentItem);
}

function menuExpansionHandler(rowItem) {
  const current = [...(menuRepeater?.data || [])];
  const index = current.findIndex(m => m._id === rowItem._id);
  if (index < 0) return;

  const node = menuById.get(rowItem.nodeId);
  const resolvedChildren = node ? getResolvedChildren(node) : [];

  const isLast = index === current.length - 1;
  const isCollapsed = isLast || current[index].level >= (current[index + 1]?.level ?? -Infinity);

  if (isCollapsed) {
    const insert = resolvedChildren.map((child) => {
      const uniqueIdSuffix = current.filter(m => m.nodeId === child._id).length;

      return {
        _id: `${child._id}-p${rowItem._id}-r${uniqueIdSuffix}`,
        nodeId: child._id,
        name: child.name,
        level: rowItem.level + 1,
        children: child.children ?? [],
        mapped: child.mapped === false ? false : true,
        desc_long: child.desc_long,
        desc_short: child.desc_short,
        image: child.image,
        url: child.url
      };
    });

    current.splice(index + 1, 0, ...insert);
  } else {
    let nextLowest = index;
    while (++nextLowest < current.length && current[nextLowest].level > rowItem.level) {}
    current.splice(index + 1, nextLowest - index - 1);
  }

  menuRepeater.data = current;
}

function menuUpdate() {
  if (!menuRepeater) return;

  menuRepeater.onItemReady(($item, itemData) => {
    const menuButton = $item('#menuRepeaterButton');
    const dropButton = $item('#menuItemDropButton');

    const node = menuById.get(itemData.nodeId);
    const hasChildren = Array.isArray(node?.children) && node.children.length > 0;

    if (hasChildren) dropButton?.show?.();
    else dropButton?.hide?.();

    let indent = '';
    for (let i = 0; i < itemData.level - 1; i++) {
      indent += '\u00A0\u00A0\u00A0\u00A0';
    }

    if (menuButton) {
      menuButton.label = indent + (itemData.name || '');
    }

    if (itemData.mapped === false) return;

    dropButton?.onClick(() => menuExpansionHandler(itemData));
    menuButton?.onClick(() => {
      if (itemData.url) wixLocationFrontend.to(itemData.url);
    });
  });
}

function expandInitialItem(currentItem) {
  const currentNode = getMenuMappedItem(currentItem);
  if (!currentNode) return false;

  const parent = menuMap.find(
    item => Array.isArray(item.children) && item.children.includes(currentNode._id)
  );

  if (!parent) return true;

  if (expandInitialItem(parent)) {
    const repItem = (menuRepeater?.data || []).find(r => r.nodeId === currentNode._id);
    if (repItem) menuExpansionHandler(repItem);

    breadcrumbsData.push({
      _id: currentNode._id,
      name: currentNode.name
    });

    if (breadcrumbs) {
      breadcrumbs.data = breadcrumbsData;
    }

    return true;
  }

  return false;
}

$w.onReady(async () => {
  menuRepeater = $w('#menuRepeater');
  breadcrumbs = $w('#breadcrumbs');

  const dyn = $w('#dynamicDataset');
  await new Promise(resolve => dyn.onReady(resolve));

  menuMap = await buildMenuMap();
  menuById = new Map((menuMap || []).map(x => [x._id, x]));

  const datasetItem = await dyn.getCurrentItem();
  if (!datasetItem) return;

  initialItem = getMenuMappedItem(datasetItem) || datasetItem;

  if (breadcrumbs) {
    breadcrumbs.onItemReady(($item, itemData) => {
      $item('#breadcrumb').label = itemData.name;
    });
  }

  await pageSetup(initialItem);
  menuUpdate();
});
/************
.web.js file
************

Backend '.web.js' files contain functions that run on the server side and can be called from page code.

Learn more at https://dev.wix.com/docs/develop-websites/articles/coding-with-velo/backend-code/web-modules/calling-backend-code-from-the-frontend

****/
import wixData from 'wix-data';
import { Permissions, webMethod } from "wix-web-module";

// =====================================================
// buildMenuMap  (YOUR WORKING VERSION — unchanged)
// =====================================================
export const buildMenuMap = webMethod(
    Permissions.Anyone,
    async () => {
        try {
            const cmsData = await wixData.query('Import909').limit(200).find();

            const rawNodes = (cmsData.items || []).map(raw => {
                const rawChildren = Array.isArray(raw.children) ? raw.children : [];
                return {
                    _id: raw?._id,
                    name: raw?.name?.trim() ?? 'unknown',
                    childrenRaw: rawChildren,
                    url: raw?.['link-categorytable-name'] ?? null,
                    desc_long: raw?.desc_long ?? `No description given for item ${raw?.name}`,
                    desc_short: raw?.desc_short ?? `No short description given for item ${raw?.name}`,
                    image: raw?.image ?? undefined
                };
            });

            const byId = new Map(rawNodes.map(n => [n._id, n]));
            const byName = new Map();
            for (const n of rawNodes) {
                const key = (n.name || '').trim();
                if (!byName.has(key)) byName.set(key, []);
                byName.get(key).push(n);
            }

            const normalizeUrl = (u) => {
                if (!u || typeof u !== 'string') return null;
                return u.endsWith('/') ? u.slice(0, -1) : u;
            };

            const isProbablyId = (v) => typeof v === 'string' && byId.has(v);

            const resolveChildToId = (parentNode, childRef) => {
                let ref = childRef;

                if (ref && typeof ref === 'object') {
                    if (typeof ref._id === 'string') ref = ref._id;
                    else if (typeof ref.id === 'string') ref = ref.id;
                    else ref = String(ref);
                }

                if (isProbablyId(ref)) return ref;

                const childName = (typeof ref === 'string') ? ref.trim() : String(ref).trim();
                const candidates = byName.get(childName) || [];

                if (candidates.length === 0) {
                    console.warn('[MENU] child name not found', { parent: parentNode?.name, childName });
                    return null;
                }
                if (candidates.length === 1) return candidates[0]._id;

                const pUrl = normalizeUrl(parentNode?.url);
                if (pUrl) {
                    const nested = candidates.find(c => {
                        const cUrl = normalizeUrl(c?.url);
                        return cUrl && cUrl.startsWith(pUrl + '/');
                    });
                    if (nested) return nested._id;
                }

                return candidates[0]._id;
            };

            const menuMap = rawNodes.map(node => {
                const resolvedChildIds = [];

                for (const childRef of (node.childrenRaw || [])) {
                    const cid = resolveChildToId(node, childRef);

                    // HARD GUARD: prevent cycles
                    if (cid && cid === node._id) {
                        console.warn('[MENU] SKIP self-child (cycle)', {
                            parentName: node.name,
                            parentId: node._id,
                            parentUrl: node.url,
                            childRef
                        });
                        continue;
                    }

                    if (cid) resolvedChildIds.push(cid);
                }

                return {
                    _id: node._id,
                    name: node.name,
                    url: node.url,
                    children: resolvedChildIds, // canonical IDs
                    desc_long: node.desc_long,
                    desc_short: node.desc_short,
                    image: node.image
                };
            });

            // console.log('[MENU] menuMap created', { count: menuMap.length });
            return menuMap;

        } catch (e) {
            console.log('[MENU] unable to build menu map', e);
            return [];
        }
    }
);

// =====================================================
// getCatPageProducts  (FIXED: Stores/Products limit 100)
// =====================================================
export const getCatPageProducts = webMethod(
    Permissions.Anyone,
    async (currentItem) => {
        try {
            const catName = currentItem?.name;
            if (!catName) {
                // console.log('[PRODS] no currentItem.name provided');
                return [];
            }

            // 1) Import910: find product rows by category
            // Try hasSome first (category field is often multi-reference/multi-select)
            let ep = await wixData
                .query('Import910')
                .hasSome('category', [catName])
                .limit(1000)
                .find();

            // Fallback if category is plain text
            if (!ep.items || ep.items.length === 0) {
                ep = await wixData
                    .query('Import910')
                    .eq('category', catName)
                    .limit(1000)
                    .find();
            }

            const extendedProductsData = (ep.items || []).map(item => ({
                details: item.details ?? undefined,
                model: item.model ?? undefined,
                primaryDesc: item.primaryDesc ?? undefined,
                desc_original: item.desc_original ?? undefined,
                lifecyclePhase: item.lifecyclePhase ?? 'Active',
                optionIdentif: item.optionIdentif ?? undefined,
                ...item
            }));

            const pageSkus = extendedProductsData
                .map(i => (typeof i.sku === 'string' ? i.sku.trim() : ''))
                .filter(Boolean);

            if (pageSkus.length === 0) {
                console.log('[PRODS] no SKUs found for category', catName);
                return [];
            }

            // 2) Stores/Products: MUST be chunked because max limit = 100
            const CHUNK_SIZE = 100;
            const storesItems = [];

            for (let i = 0; i < pageSkus.length; i += CHUNK_SIZE) {
                const chunk = pageSkus.slice(i, i + CHUNK_SIZE);

                const wpChunk = await wixData
                    .query('Stores/Products')
                    .hasSome('sku', chunk)
                    .limit(100) // IMPORTANT: Stores max 100
                    .find();

                storesItems.push(...(wpChunk.items || []));
            }

            const lookup = Object.fromEntries(
                (storesItems || []).map(obj => [String(obj.sku || '').trim(), obj])
            );

            // 3) Merge Import910 + Stores/Products
            const merged = extendedProductsData.map(obj => ({
                ...obj,
                ...(lookup[String(obj.sku || '').trim()] || {})
            }));

            // 4) Pick only what your frontend expects
            const pick = (obj, keys) => Object.fromEntries(keys.map(k => [k, obj[k]]));

            const productsData = merged.map(o => {
                const product = pick(o, [
                    "_id",
                    "price",
                    "sku",
                    "model",
                    "primaryDesc",
                    "desc_original",
                    "formattedPrice",
                    "link-products-2-slug",
                    "mainMedia",
                    "details",
                    "optionIdentif",
                    "leadTime",
                    "lifecyclePhase",
                    "productPageUrl",
                    "inStock",
                    "quantityInStock",
                    "isInStock"
                ]);

                return product;
            });

            // 5) Cheapest per model (fallback to sku if model missing)
            const cheapestProducts = Object.values(
                productsData.reduce((acc, p) => {
                    const key = p?.model || p?.sku;
                    if (!key) return acc;

                    const pPrice = (typeof p.price === 'number') ? p.price : Number(p.price);
                    const accPrice = acc[key]?.price;
                    const accNum = (typeof accPrice === 'number') ? accPrice : Number(accPrice);

                    if (!acc[key] || (pPrice < accNum)) acc[key] = p;
                    return acc;
                }, {})
            );
            return cheapestProducts;

        } catch (e) {
            console.log('[PRODS] getCatPageProducts error', e);
            return [];
        }
    }
);
import wixData from 'wix-data';
import { processQuoteBackend } from 'backend/quoteEmails.web.js';
import { TrackingManager } from 'public/TrackingManager.js';

const DATASET_SEL = '#dataset1';
const DROPDOWN_SEL = '#productsDropdown';
const QTY_INPUT_SEL = '#qtyInput';
const ADD_BTN_SEL = '#addProductBtn';
const REPEATER_SEL = '#addedProductsRepeater';
const LOADER_SEL = '#loadingText';

let selectedProducts = [];
// [{ id: 'productId', sku: 'SKU123', qty: 2, price: 10.00 }]
let productCatalog = new Map();
// productId -> { sku, price }

// ---------------- ON READY ----------------
$w.onReady(() => {
    const repeater = $w(REPEATER_SEL);
    let trackingManager = TrackingManager.autoInitialize('#requestQuoteForm');

    // Repeater: render each selected product
    repeater.onItemReady(($item, itemData) => {
        // itemData: { _id, sku, qty }
        $item('#skuText').text = `${itemData.sku} × ${itemData.qty}`;

        $item('#removeBtn').onClick(() => {
            selectedProducts = selectedProducts.filter(p => p.id !== itemData._id);
            renderSelectedProducts();
            updateAddButtonEnabledState();
        });
    });

    // start empty
    repeater.data = [];
    repeater.hide();
    $w(ADD_BTN_SEL).disable();
    $w(QTY_INPUT_SEL).value = "1";

    $w(DATASET_SEL).onReady(async () => {
      $w(DATASET_SEL).setFieldValues(trackingManager.applicableValues)
        // Enable/disable Add based on selection + qty
        $w(DROPDOWN_SEL).onChange(updateAddButtonEnabledState);
        $w(QTY_INPUT_SEL).onInput(updateAddButtonEnabledState);

        await populateProductsDropdown();

        // Add Product click
        $w(ADD_BTN_SEL).onClick(() => {
            if (!$w(ADD_BTN_SEL).enabled) return;

            const productId = $w(DROPDOWN_SEL).value;
            if (!productId) return;

            const meta = productCatalog.get(productId);
            if (!meta) return;

            // get qty (default 1; min 1)
            let qty = Number($w(QTY_INPUT_SEL).value);
            if (!qty || qty < 1) qty = 1;

            // merge or add
            const existing = selectedProducts.find(p => p.id === productId);
            if (existing) {
                existing.qty += qty;
            } else {
                selectedProducts.push({
                    id: productId,
                    sku: meta.sku,
                    qty,
                    price: meta.price
                });
            }

            renderSelectedProducts();
            updateAddButtonEnabledState();
        });

        // After dataset save -> link products (and store qtys/prices + summary)
        $w(DATASET_SEL).onAfterSave(async (item) => {
            try {
                // Pass only what's necessary – the new quote ID + selected products array
                const payload = {
                    quoteId: item._id,
                    selectedProducts: selectedProducts.map(p => ({
                        id: p.id,
                        sku: p.sku,
                        qty: p.qty,
                        price: p.price || 0
                    }))
                };
                
                const result = await processQuoteBackend(payload);

                console.log("Backend processing result:", result);

                // Clear UI
                selectedProducts = [];
                renderSelectedProducts();
                updateAddButtonEnabledState();

            } catch (err) {
                console.error("Failed to process quote:", err);
                // optionally show user message
            }
        });
    });
});

// ---------------- HELPERS ----------------

function updateAddButtonEnabledState() {
    const hasSelection = !!$w(DROPDOWN_SEL).value;
    let qty = Number($w(QTY_INPUT_SEL).value);
    if (!qty || qty < 1) qty = 0;

    if (hasSelection && qty >= 1 && $w(DROPDOWN_SEL).options.length) {
        $w(ADD_BTN_SEL).enable();
    } else {
        $w(ADD_BTN_SEL).disable();
    }
}

async function populateProductsDropdown() {
    // Disable while loading
    $w(DROPDOWN_SEL).disable();
    $w(ADD_BTN_SEL).disable();
    $w(QTY_INPUT_SEL).disable();
    $w(DROPDOWN_SEL).placeholder = 'Loading products…';
    $w(LOADER_SEL).show();

    try {
        const all = await getAllProductsPaged();

        const options = all.map(p => {
            const sku = (p.sku || `ID-${String(p._id).slice(-6)}`).trim();
            const price = Number(p.price) || 0; // assuming Stores/Products.price

            // store for later lookup
            productCatalog.set(p._id, { sku, price });

            return {
                label: sku,
                value: p._id
            };
        });

        $w(DROPDOWN_SEL).options = options;
        $w(DROPDOWN_SEL).enable();
        $w(QTY_INPUT_SEL).enable();
        $w(DROPDOWN_SEL).placeholder = 'Select a product';
        updateAddButtonEnabledState();
    } catch (e) {
        console.error(e);
        $w(DROPDOWN_SEL).placeholder = 'Failed to load';
    } finally {
        $w(LOADER_SEL).hide();
    }
}

async function getAllProductsPaged() {
    let res = await wixData.query('Stores/Products').ascending('sku').limit(100).find();
    const all = [...res.items];
    while (res.hasNext()) {
        res = await res.next();
        all.push(...res.items);
    }
    return all;
}

function renderSelectedProducts() {
    const repeater = $w(REPEATER_SEL);
    const data = selectedProducts.map(p => ({
        _id: p.id,
        sku: p.sku,
        qty: p.qty
        // keeping price internal; UI stays as before
    }));

    repeater.data = data;

    if (data.length) {
        repeater.show();
    } else {
        repeater.hide();
    }
}

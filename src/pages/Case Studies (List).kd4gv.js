import wixData from 'wix-data';

let debounceTimer;
const DEBOUNCE_MS = 250;

const COLLECTION_ID = 'CaseStudies';

const TAG_FIELDS = {
  application: 'applicationCategoryTags',
  industry: 'industryCategoryTag',
  product: 'productCategoryTag',
};

const DROPDOWNS = {
  application: '#applicationDropdown',
  industry: '#industryDropdown',
  product: '#productDropdown',
};

$w.onReady(() => {
  const ds = $w('#dynamicDataset');

  ds.onReady(async () => {
    // Populate dropdowns once dataset is ready (async is fine inside)
    await Promise.all([
      populateDropdownFromTagField(COLLECTION_ID, TAG_FIELDS.application, DROPDOWNS.application, 'All Applications'),
      populateDropdownFromTagField(COLLECTION_ID, TAG_FIELDS.industry, DROPDOWNS.industry, 'All Industries'),
      populateDropdownFromTagField(COLLECTION_ID, TAG_FIELDS.product, DROPDOWNS.product, 'All Products'),
    ]);

    // Wire events
    $w('#searchInput').onInput(() => debouncedApplyFilters());
    $w(DROPDOWNS.application).onChange(() => applyFilters());
    $w(DROPDOWNS.industry).onChange(() => applyFilters());
    $w(DROPDOWNS.product).onChange(() => applyFilters());

    // Initial filter pass
    await applyFilters();
  });
});

function debouncedApplyFilters() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => applyFilters(), DEBOUNCE_MS);
}

async function applyFilters() {
  const text = $w('#searchInput').value.trim();

  const applicationVal = $w(DROPDOWNS.application).value;
  const industryVal = $w(DROPDOWNS.industry).value;
  const productVal = $w(DROPDOWNS.product).value;

  let f = wixData.filter();

  // If these are TAG (array) fields, keep hasSome(). If they're text, switch to contains().
  if (applicationVal) f = f.hasSome(TAG_FIELDS.application, [applicationVal]);
  if (industryVal) f = f.hasSome(TAG_FIELDS.industry, [industryVal]);
  if (productVal) f = f.hasSome(TAG_FIELDS.product, [productVal]);

  if (text) f = f.contains('title_fld', text); // adjust if your text field differs

  return $w('#dynamicDataset').setFilter(f);
}

async function populateDropdownFromTagField(collectionId, fieldKey, dropdownSelector, allLabel = 'All') {
  const valuesSet = new Set();

  let skip = 0;
  const limit = 1000;
  let hasMore = true;

  while (hasMore) {
    const res = await wixData.query(collectionId).skip(skip).limit(limit).find();

    res.items.forEach(item => {
      const raw = item[fieldKey];
      normalizeTagFieldToArray(raw).forEach(v => valuesSet.add(v));
    });

    skip += res.items.length;
    hasMore = res.hasNext();
  }

  $w(dropdownSelector).options = [
    { label: allLabel, value: '' },
    ...Array.from(valuesSet)
      .sort((a, b) => a.localeCompare(b))
      .map(v => ({ label: v, value: v })),
  ];
}

function normalizeTagFieldToArray(raw) {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw.map(x => String(x).trim()).filter(Boolean);
  }

  const str = String(raw).trim();
  if (!str) return [];

  if (str.includes(',')) {
    return str.split(',').map(s => s.trim()).filter(Boolean);
  }

  return [str];
}

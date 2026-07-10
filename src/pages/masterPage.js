import wixData from "wix-data";
import wixLocation from 'wix-location';
import { rendering } from 'wix-window'; // guard against SSR double-run
import wixSeoFrontend from 'wix-seo-frontend';

$w.onReady(async function () {

  // --- TEMP DIAGNOSTIC - remove after use ---
  if (wixLocation.url.includes("DEBUG_SOFTWARE_LOOKUP")) {
    const searchTerms = ["LabVIEW", "TestStand", "FlexLogger", "InstrumentStudio", "VeriStand", "SystemLink"];
    const results = {};

    for (const term of searchTerms) {
      const productRes = await wixData.query("Stores/Products").contains("name", term).limit(100).find();
      results[term] = productRes.items.map((item) => ({
        name: item.name,
        sku: item.sku,
        productPageUrl: item.productPageUrl,
        priceFormatted: item.formattedPrice ?? item.priceData?.formatted?.price
      }));
    }

    console.log("=== Software Products Found ===");
    console.log(JSON.stringify(results, null, 2));
  }
  // --- END TEMP DIAGNOSTIC ---

  // --- Canonical Tag Fix for Paginated Pages (category, blog, search, etc.) ---
  // Runs on BOTH server (SSR) and browser render, since Googlebot often reads
  // the SSR-rendered head. Do not move this below the rendering.env guard.
  setCanonicalForPagination();
  // --- End Canonical Tag Fix ---

  // Menu hover/tab wiring is browser-only; skip during SSR/crawler render to reduce memory/CPU.
  if (rendering && rendering.env !== 'browser') {
    return;
  }

  const allElements = $w('Box, Button, Text, Image');

  allElements.forEach((element) => {
    const id = element.id;
    if (!id || !id.includes('-')) {
      return;
    }

    const parts = id.split('-');

    // --- 1) Backwards compatibility: old pattern "button6-Tab1" ---
    const oldTabMatch = id.match(/^button(\d*)-Tab(\d+)?$/);
    if (oldTabMatch) {
      const tabIndex = typeof oldTabMatch[2] === 'undefined' ? '0' : oldTabMatch[2];
      setupTabLinkButton(element, tabIndex);
      return;
    }

    // --- 2) New + generic patterns ---

    // Pattern: "menuPrefix-Tab1"  (2 parts, second is Tab…)
    if (parts.length === 2) {
      const [menuPrefix, second] = parts;
      const tabMatch = second.match(/^Tab(\d+)?$/);

      if (tabMatch) {
        const tabIndex = typeof tabMatch[1] === 'undefined' ? '0' : tabMatch[1];
        setupTabLinkButton(element, tabIndex);
        return;
      }

      // Regular 2-part menu button: "menuPrefix-targetState"
      setupMenuButton(element, menuPrefix, second);
      return;
    }

    // Pattern: "menuPrefix-targetState-Tab1"  (3 parts)
    if (parts.length === 3) {
      const [menuPrefix, targetState, tabPart] = parts;

      // Tab logic on the 3rd segment, e.g. "Tab1"
      const tabMatch = tabPart.match(/^Tab(\d+)?$/);
      if (tabMatch) {
        const tabIndex = typeof tabMatch[1] === 'undefined' ? '0' : tabMatch[1];
        // This will append ?tab=n to whatever link is already set on the element
        setupTabLinkButton(element, tabIndex);
      }

      // Menu logic using the first two segments:
      // e.g. "ProdPanel1-DAQUSBPanel1-Tab1"
      // -> change multistate box #ProdPanel1 to state "DAQUSBPanel1"
      setupMenuButton(element, menuPrefix, targetState);
      return;
    }

    // ✅ NEW: Pattern: "menuPrefix-targetState-menuPrefix2-targetState2" (4 parts)
    // Example: "ProdPanel1-DAQUSBPanel1-SubPanelA-SubState2"
    if (parts.length === 4) {
      const [menuPrefix1, targetState1, menuPrefix2, targetState2] = parts;

      setupMenuButton(element, menuPrefix1, targetState1);
      setupMenuButton(element, menuPrefix2, targetState2);
      return;
    }

    // If there are more than 3 parts, you could optionally decide what to do here.
    // For now we ignore them.
  });

  // Apply ?tab=… from the URL to any Tabs element on the page
  applyTabFromQuery();

});

// ---------------- CANONICAL TAG FOR PAGINATION ----------------

function setCanonicalForPagination() {
  try {
    const query = wixLocation.query;   // e.g. { page: '2' }
    const path = wixLocation.path;     // e.g. ['category', 'pxi-modules']

    // Only act if a ?page= param exists in the URL
    if (query && query.page) {
      const cleanPath = '/' + path.join('/');
      const canonicalUrl = 'https://www.cyth.com' + cleanPath;

      wixSeoFrontend.setLinks([
        { rel: 'canonical', href: canonicalUrl }
      ]);
    }
    // If no ?page= param, do nothing — Wix's default canonical behavior stands
  } catch (err) {
    console.warn('Canonical pagination fix failed:', err);
  }
}

// ---------------- TAB QUERY HANDLING ----------------

function applyTabFromQuery() {
  // Run only in browser to avoid SSR flicker/double execution
  if (rendering && rendering.env !== 'browser') return;

  const raw = wixLocation.query && wixLocation.query.tab;
  if (typeof raw === 'undefined') return;

  const strips = $w('Tabs');
  if (!strips || !strips.length) return;

  const rawStr = String(raw);
  strips.forEach((strip) => {
    const tabs = strip.tabs || [];
    if (!tabs.length) return;

    const target = resolveTargetTab(tabs, rawStr);
    if (target) {
      strip.changeTab(target).catch(() => {}); // ignore if already active / invalid
    }
  });
}

function resolveTargetTab(tabs, raw) {
  // 1) numeric index
  const asNumber = Number(raw);
  if (!Number.isNaN(asNumber) && asNumber >= 0 && asNumber < tabs.length) {
    return tabs[asNumber];
  }

  // 2) exact id, 3) case-insensitive label
  const key = raw.toLowerCase();
  return tabs.find(
    (t) =>
      (t.id && t.id.toLowerCase && t.id.toLowerCase() === key) ||
      (t.label && t.label.toLowerCase && t.label.toLowerCase() === key)
  );
}

// ---------------- BUTTON TAB LINK WIRING ----------------

function setupTabLinkButton(element, tabIndex) {
  const originalLink = element.link;

  if (!originalLink) {
    console.warn(`Tab element "${element.id}" has no link set.`);
    return;
  }

  // Avoid duplicates
  if (originalLink.includes(`tab=${tabIndex}`)) {
    return;
  }

  const separator = originalLink.includes('?') ? '&' : '?';
  const newLink = `${originalLink}${separator}tab=${tabIndex}`;

  element.link = newLink;
  // console.log(`Tab link wired: ${element.id} -> ${newLink}`);
}

// ---------------- MENU / MULTISTATE LOGIC ----------------

// Updated signature: we pass menuPrefix + targetState explicitly
function setupMenuButton(button, menuPrefix, targetState) {
  const stateBox = $w(`#${menuPrefix}`);
  const state = $w(`#${targetState}`);

  if (!stateBox || !state) {
    return;
  }

  let hoverTimer = null;

  button.onMouseIn(() => {
    hoverTimer = setTimeout(() => {
      // changeState uses the state's ID string
      stateBox.changeState(targetState);

      // Existing extra behavior for "*Page" -> "*Panel"
      if (targetState.endsWith('Page')) {
        const panelState = targetState.replace('Page', 'Panel');
        const panelPrefix = menuPrefix.replace('Box', 'Panel');
        const panelBox = $w(`#${panelPrefix}`);
        const panelStateElement = $w(`#${panelState}`);

        if (panelBox && panelStateElement) {
          panelBox.changeState(panelState);
        } else {
          console.warn(`Could not switch panel box (${panelPrefix}) to state (${panelState})`);
        }
      }
    }, 400);
  });

  button.onMouseOut(() => {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
  });
}

import { buildMenuMap } from 'backend/category_menu.web';
import wixLocation from 'wix-location-frontend';

const L = (tag, payload) => payload !== undefined
  ? console.log(`[DIAG] ${tag}:`, payload)
  : console.log(`[DIAG] ${tag}`);
const W = (tag, payload) => console.warn(`[WARN] ${tag}:`, payload);
const E = (tag, err) => console.error(`[ERR] ${tag}:`, err);

let menuMap = [];
let menuRepeater;

// --- helpers copied/adapted from your CategoryTable page ---
function getResolvedChildren(item) {
  const resolved = [];
  if (item?.children) {
    for (const childName of item.children) {
      const found = menuMap.find(m => m.name === childName);
      if (found) resolved.push(found);
      else {
        resolved.push({ _id: `${item?._id}-missing-${childName}`, name: childName, mapped: false, children: [] });
        W('child not in menuMap', childName);
      }
    }
  }
  return resolved;
}

function menuExpansionHandler(item) {
  try {
    const current = (menuRepeater?.data || []).slice();
    const index = current.findIndex(m => m._id === item._id);
    if (index < 0) return;

    const resolvedChildren = getResolvedChildren(item);

    const isLast = index === current.length - 1;
    const isCollapsed = isLast || current[index].level >= (current[index + 1]?.level ?? -Infinity);

    if (isCollapsed) {
      const insert = [];
      for (const child of resolvedChildren) {
        const uniqueIdSuffix = current.filter(m => m.name === child.name).length;
        insert.push({
          _id: `${child._id}-r${uniqueIdSuffix}`,
          name: child.name,
          level: item.level + 1,
          children: child.children,
          mapped: child.mapped === false ? false : true,
          url: child.url // <-- IMPORTANT: your buildMenuMap must provide this
        });
      }
      current.splice(index + 1, 0, ...insert);
    } else {
      let nextLowest = index;
      while (++nextLowest < current.length && current[nextLowest].level > item.level) { /* walk */ }
      current.splice(index + 1, nextLowest - index - 1);
    }

    menuRepeater.data = current;
  } catch (err) {
    E('menuExpansionHandler', err);
  }
}

$w.onReady(async () => {
  try {
    menuRepeater = $w('#menuRepeater');

    // Build the same map your category page uses (should include `url` for each category item)
    menuMap = await buildMenuMap();
    L('menuMap built', { count: menuMap?.length });

    const root = menuMap.find(i => i.name === 'root');
    if (!root) {
      W('No root in menuMap');
      menuRepeater.data = [];
      return;
    }

    // Initial menu = root children (top-level)
    const data = getResolvedChildren(root).map((child, idx) => ({
      _id: `${child._id}-r0-${idx}`,
      name: child.name,
      level: 1,
      children: child.children ?? [],
      mapped: child.mapped === false ? false : true,
      url: child.url
    }));

    menuRepeater.data = data;

    // Render/wire
    menuRepeater.onItemReady(($item, itemData) => {
      const btn = $item('#menuRepeaterButton');
      const drop = $item('#menuItemDropButton');

      // indent for nested items
      let indent = '';
      for (let i = 0; i < (itemData.level - 1); i++) indent += '\u00A0\u00A0\u00A0\u00A0';
      if (btn) btn.label = indent + (itemData.name || '');

      // hide expand if no children
      const hasChildren = Array.isArray(itemData.children) && itemData.children.length > 0;
      if (!hasChildren) drop?.hide?.();

      // Expand/collapse
      drop?.onClick(() => menuExpansionHandler(itemData));

      // Navigate to the dynamic ITEM page for that category
      btn?.onClick(() => {
        if (!itemData.url) {
          W('No url on menu item', itemData);
          return;
        }
        wixLocation.to(itemData.url);
      });
    });

  } catch (err) {
    E('Landing onReady', err);
  }
});




import { buildMenuMap } from 'backend/category_menu.web';
import wixLocation from 'wix-location-frontend';

// ================================
// DIAG helpers
// ================================
const L = (tag, payload) =>
  payload !== undefined ? console.log(`[DIAG] ${tag}:`, payload) : console.log(`[DIAG] ${tag}`);
const W = (tag, payload) => console.warn(`[WARN] ${tag}:`, payload);
const E = (tag, err) => console.error(`[ERR] ${tag}:`, err);

// ================================
// State
// ================================
let menuMap = [];
let menuById = new Map(); // canonical nodeId -> node
let menuRepeater;

const wiredDrop = new Set();
const wiredBtn = new Set();

// ================================
// Helpers
// ================================
function summarizeRow(r) {
  if (!r) return null;
  return {
    rowId: r._id,
    nodeId: r.nodeId,
    name: r.name,
    level: r.level,
    url: r.url,
    childCount: Array.isArray(r.children) ? r.children.length : 0
  };
}

function summarizeNode(n) {
  if (!n) return null;
  return {
    _id: n._id,
    name: n.name,
    url: n.url,
    childCount: Array.isArray(n.children) ? n.children.length : 0
  };
}

/**
 * Resolve children (IDs) for a repeater ROW by using its canonical nodeId.
 * Also prevents cycles: if a node lists itself as a child, we skip it.
 */
function getResolvedChildrenForRow(row) {
  const resolved = [];

  const nodeId = row?.nodeId;
  if (!nodeId) {
    W('getResolvedChildrenForRow: missing nodeId on row', row);
    return resolved;
  }

  const node = menuById.get(nodeId);
  if (!node) {
    W('getResolvedChildrenForRow: nodeId not found in menuById', { nodeId, row: summarizeRow(row) });
    return resolved;
  }

  const childIds = Array.isArray(node.children) ? node.children : [];

  for (const childId of childIds) {
    // ✅ cycle guard (the bug your log revealed)
    if (childId === nodeId) {
      W('SKIP self-child (cycle) in frontend', {
        nodeId,
        nodeName: node.name,
        nodeUrl: node.url,
        childId
      });
      continue;
    }

    const childNode = menuById.get(childId);
    if (childNode) resolved.push(childNode);
    else W('child id not in menuById', { parentNodeId: nodeId, childId });
  }

  return resolved;
}

// ================================
// Expand/collapse handler
// ================================
function menuExpansionHandler(rowItem) {
  try {
    const current = (menuRepeater?.data || []).slice();
    const index = current.findIndex(m => m._id === rowItem._id);
    if (index < 0) {
      W('expand: clicked row not found in repeater.data', summarizeRow(rowItem));
      return;
    }

    const resolvedChildren = getResolvedChildrenForRow(rowItem);

    const isLast = index === current.length - 1;
    const isCollapsed = isLast || current[index].level >= (current[index + 1]?.level ?? -Infinity);

    L('EXPAND CLICK', {
      clickedRow: summarizeRow(rowItem),
      isCollapsed,
      resolvedChildren: resolvedChildren.map(summarizeNode)
    });

    if (isCollapsed) {
      const insert = [];

      for (const child of resolvedChildren) {
        // Safety (should already be filtered)
        if (child._id === rowItem.nodeId) {
          W('SKIP insert cycle (child is same as parent nodeId)', {
            parent: summarizeRow(rowItem),
            child: summarizeNode(child)
          });
          continue;
        }

        // Unique per placement
        const uniqueIdSuffix = current.filter(m => m.nodeId === child._id).length;

        insert.push({
          _id: `${child._id}-p${rowItem._id}-r${uniqueIdSuffix}`, // row instance id
          nodeId: child._id,                                      // ✅ canonical node id
          name: child.name,
          level: rowItem.level + 1,
          url: child.url,
          // keep children on the row too if you want quick "hasChildren" checks:
          children: Array.isArray(child.children) ? child.children : []
        });
      }

      L('EXPAND INSERT', {
        parent: summarizeRow(rowItem),
        insertCount: insert.length,
        insertPreview: insert.slice(0, 12).map(summarizeRow)
      });

      current.splice(index + 1, 0, ...insert);
    } else {
      let nextLowest = index;
      while (++nextLowest < current.length && current[nextLowest].level > rowItem.level) { /* walk */ }

      L('COLLAPSE REMOVE', {
        parent: summarizeRow(rowItem),
        removeCount: nextLowest - index - 1
      });

      current.splice(index + 1, nextLowest - index - 1);
    }

    menuRepeater.data = current;

  } catch (err) {
    E('menuExpansionHandler', err);
  }
}

// ================================
// Page init
// ================================
$w.onReady(async () => {
  try {
    menuRepeater = $w('#menuRepeater');

    menuMap = await buildMenuMap();
    menuById = new Map((menuMap || []).map(x => [x._id, x]));

    L('menuMap built', { count: menuMap.length });

    const rootNode = menuMap.find(i => i.name === 'root');
    if (!rootNode) {
      W('No root in menuMap');
      menuRepeater.data = [];
      return;
    }

    // Build top level rows from root's children (canonical)
    const topChildren = Array.isArray(rootNode.children)
      ? rootNode.children.map(cid => menuById.get(cid)).filter(Boolean)
      : [];

    menuRepeater.data = topChildren.map((child, idx) => ({
      _id: `${child._id}-top-${idx}`, // row instance id
      nodeId: child._id,             // ✅ canonical node id
      name: child.name,
      level: 1,
      url: child.url,
      children: Array.isArray(child.children) ? child.children : []
    }));

    // Render/wire
    menuRepeater.onItemReady(($item, itemData) => {
      const btn = $item('#menuRepeaterButton');
      const drop = $item('#menuItemDropButton');

      // indent label
      let indent = '';
      for (let i = 0; i < (itemData.level - 1); i++) indent += '\u00A0\u00A0\u00A0\u00A0';
      if (btn) btn.label = indent + (itemData.name || '');

      // Determine hasChildren from canonical node (most accurate)
      const node = menuById.get(itemData.nodeId);
      const hasChildren = Array.isArray(node?.children) && node.children.length > 0;

      if (drop) {
        if (!hasChildren) {
          drop.hide();
        } else {
          drop.show();

          // Wire ONCE per row instance id
          if (!wiredDrop.has(itemData._id)) {
            wiredDrop.add(itemData._id);

            drop.onClick(() => {
              L('DROP CLICK', summarizeRow(itemData));
              menuExpansionHandler(itemData);
            });
          }
        }
      }

      if (btn) {
        if (!wiredBtn.has(itemData._id)) {
          wiredBtn.add(itemData._id);

          btn.onClick(() => {
            L('NAV CLICK', summarizeRow(itemData));
            if (!itemData.url) {
              W('No url on menu item', summarizeRow(itemData));
              return;
            }
            wixLocation.to(itemData.url);
          });
        }
      }
    });

  } catch (err) {
    E('Landing onReady', err);
  }
});
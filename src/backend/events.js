// backend/events.js
import { fetch } from "wix-fetch";
import { elevate } from "wix-auth";
import { contacts } from "wix-crm.v2";
import { orders } from "wix-ecom-backend";

// Hardcoded Zapier Catch Hook URL
const ZAPIER_WEBHOOK_URL = "https://hooks.zapier.com/hooks/catch/25421772/ulpyhc6/";

const elevatedGetContact = elevate(contacts.getContact);

export async function wixCrm_onContactCreated(event) {
  try {
    const contactId =
      event?.entity?._id ||
      event?.metadata?.entityId;

    if (!contactId) {
      console.warn("wixCrm_onContactCreated: missing contactId in event:", event);
      return;
    }

    // Fetch the full contact so extendedFields/custom fields are reliable
    const c = await elevatedGetContact(contactId);

    const payload = {
      event: "contact.created",
      occurredAt: event?.metadata?.eventTime || new Date().toISOString(),

      // include a small subset that's easy to map in Zapier
      contact: {
        id: c?._id || contactId,
        revision: c?.revision,
        firstName: c?.info?.name?.first || "",
        lastName: c?.info?.name?.last || "",
        company: c?.info?.company || null,
        email: c.primaryInfo.email,
        phone: c.primaryInfo.phone,
        addresses: c.info.addresses || [],

        extendedFields: c?.info?.extendedFields || {},

        labelKeys: c?.info?.labelKeys || [],
      },

      // optional: include raw event metadata for debugging
      wixEventMeta: event?.metadata || null,
    };

    const res = await fetch(ZAPIER_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error(`Zapier webhook failed (${res.status}): ${txt}`);
    }
  } catch (err) {
    console.error("wixCrm_onContactCreated handler failed:", err);
  }
}

// ---------------------------------------------------------------------------
// New eCommerce order -> Zapier "wix-order-po-tax-zoho" workflow.
// Wix's Zapier "Order placed" trigger leaves out custom checkout-form fields
// ("PO# (if applicable)", "Tax exemption ID"), so the full order is sent from
// here and the workflow writes those two values onto the order's WIX record in Zoho.
// ---------------------------------------------------------------------------
const ORDER_FIELDS_WEBHOOK_URL = "https://hooks.zapier.com/hooks/catch/25421772/CMYTRmDAEaMDvbVJC/";

const elevatedGetOrder = elevate(orders.getOrder);

export async function wixEcom_onOrderCreated(event) {
  try {
    const orderId = event?.entity?._id || event?.metadata?.entityId;
    if (!orderId) {
      console.warn("wixEcom_onOrderCreated: missing order id in event:", event);
      return;
    }

    // Read the full order so custom checkout fields / extended fields are included.
    let order = event?.entity || {};
    try {
      order = (await elevatedGetOrder(orderId)) || order;
    } catch (err) {
      console.warn("wixEcom_onOrderCreated: getOrder failed, using event entity:", err);
    }

    const res = await fetch(ORDER_FIELDS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "order.created",
        orderNumber: order?.number || event?.entity?.number || "",
        orderId,
        order,
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error(`Order fields webhook failed (${res.status}): ${txt}`);
    }
  } catch (err) {
    console.error("wixEcom_onOrderCreated handler failed:", err);
  }
}

// backend/events.js
import { fetch } from "wix-fetch";
import { elevate } from "wix-auth";
import { contacts } from "wix-crm.v2";

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

import { Permissions, webMethod } from "wix-web-module";
import { contacts } from "wix-crm.v2";
import { triggeredEmails } from "wix-crm-backend";
import { elevate } from "wix-auth";
import wixData from 'wix-data';

// Code-name of your Triggered Email template in Wix
const TEMPLATE_ID = "QUOTE_CONFIRMATION";
const WIX_STORES_APP_ID = "215238eb-22a5-4c36-9e7b-e7c08025e04e";

// Elevate CRM operations so they can run from this web module
const elevatedCreateContact = elevate(contacts.createContact);
const elevatedQueryContacts = elevate(contacts.queryContacts);

/**
 * Internal helper:
 * Create a contact if possible; if email already exists, reuse that contact.
 */
async function createOrGetContactId({ email, firstName, lastName, company, gclid, utm_source, utm_medium, utm_campaign, utm_content, utm_term }) {
    if (!email) {
        throw new Error("Missing email for contact.");
    }

    // Try to create a new contact (no duplicates allowed)
    return elevatedCreateContact({
        name: {
            first: firstName || "",
            last: lastName || "",
        },
        emails: {
            items: [{ email, primary: true }],
        },
        company: company,
        extendedFields: {
            items: {
                "custom.gclid": gclid,
                "custom.utmcampaign": utm_campaign,
                "custom.utmsource": utm_source,
                "custom.utmmedium": utm_medium,
                "custom.utmcontent": utm_content,
                "custom.utmterm": utm_term
            }
        }
    }, {
        allowDuplicates: false, // explicit; default is false
    })
    .catch((err) => {
        console.log("error creating contact")
        const msg = String(err?.message || "").toLowerCase();

        // If it's not a "duplicate email" style error, bubble it up
        const looksLikeDuplicate =
            msg.includes("already") &&
            msg.includes("exist") &&
            msg.includes("email");

        if (!looksLikeDuplicate) {
            throw err;
        }

        // Email is already in use: look up existing contact by email
        return elevatedQueryContacts().eq("primaryInfo.email", email).find()
        .then((existing) => {
            if (!existing.items.length) {
                // Defensive: duplicate error but nothing found
                throw new Error(
                    "Duplicate email reported, but no existing contact found."
                );
            }

            return existing.items[0]._id;
        })
    })
}

/**
 * Build the products list text for the email.
 * Priority:
 *  1) Use quoteItem.productsEmailSummary if provided by frontend.
 *  2) Else, derive from productsQuantitiesJson (with price support).
 */
function buildProductsListFromQuote(quoteItem = {}) {
    // If frontend already computed a nice summary, just use it
    if (quoteItem.productsEmailSummary) {
        return quoteItem.productsEmailSummary;
    }

    const items = Array.isArray(quoteItem.productsQuantitiesJson) ?
        quoteItem.productsQuantitiesJson : [];

    if (!items.length) {
        return "No products were selected.";
    }

    let total = 0;

    const lines = items.map((p) => {
        const sku = p.sku || p.productId || "Unknown SKU";
        const qty = Number(p.qty) || 0;
        const unit = Number(p.price) || 0;
        const lineTotal = unit * qty;

        if (!qty) {
            return `• ${sku} (quantity to be confirmed)`;
        }

        if (!unit) {
            return `• ${sku} × ${qty} (price to be confirmed)`;
        }

        total += lineTotal;
        return `• ${sku} × ${qty} @ $${unit.toFixed(2)} = $${lineTotal.toFixed(2)}`;
    });

    const totalLine = `Total (parts only): $${total.toFixed(2)}`;

    return [
        "Requested Parts:",
        ...lines,
        "----------------------",
        totalLine,
    ].join("\n");
}

function buildCartLineItemsFromQuote(quoteItem = {}) {
    const items = Array.isArray(quoteItem.productsQuantitiesJson) ?
        quoteItem.productsQuantitiesJson : [];

    return items
        .map((p) => {
            const productId = p.productId; // <-- make sure you're passing the Wix Stores productId here
            const quantity = Math.max(1, Number(p.qty) || 1);

            if (!productId) return null;

            // Optional: if you store a variantId, pass it like this:
            // options: { variantId: p.variantId }
            const catalogReference = {
                appId: WIX_STORES_APP_ID,
                catalogItemId: productId,
                ...(p.variantId ? { options: { variantId: p.variantId } } : {}),
            };

            return { catalogReference, quantity };
        })
        .filter(Boolean);
}

/**
 * Public web method:
 * Called from your page code after the quote is fully saved & updated.
 * Expects quoteItem to contain at least:
 *  - email, firstName, lastName, company
 *  - productsEmailSummary OR productsQuantitiesJson
 */
export const sendQuoteConfirmation = webMethod(
    Permissions.Anyone,
    async (quoteItem) => {
        const email = quoteItem.email;
        const firstName = quoteItem.firstName;
        const lastName = quoteItem.lastName;
        const company = quoteItem.company;
        const gclid = quoteItem.gclid
        const utm_source = quoteItem.utm_source
        const utm_medium = quoteItem.utm_medium
        const utm_campaign = quoteItem.utm_campaign
        const utm_content = quoteItem.utm_content
        const utm_term = quoteItem.utm_term

        if (!email) {
            // No email → nothing to send
            return { success: false, reason: "missing-email" };
        }

        const contactId = await createOrGetContactId({
            email,
            firstName,
            lastName,
            company,
            gclid,
            utm_source,
            utm_medium,
            utm_campaign,
            utm_content,
            utm_term,
        });

        const productsList = buildProductsListFromQuote(quoteItem);

        await triggeredEmails.emailContact(TEMPLATE_ID, contactId, {
            variables: {
                'input.productsList': productsList
            },
        });

        return { success: true };
    }
);
export const processQuoteBackend = webMethod(
    Permissions.Anyone,
    (payload) => {
        const { quoteId, selectedProducts } = payload;

        // Basic guardrails (optional but helpful)
        if (!quoteId) {
            return Promise.reject(new Error("Missing quoteId"));
        }
        if (!Array.isArray(selectedProducts)) {
            return Promise.reject(new Error("selectedProducts must be an array"));
        }

        let existingQuote; // capture full existing item for later merge

        // 1) Fetch the full existing quote
        return wixData
            .get("BuildAQuote", quoteId, { suppressAuth: true })
            .then((quote) => {
                if (!quote) {
                    throw new Error(`Quote with ID ${quoteId} not found`);
                }
                existingQuote = quote;

                // 2) Link product references
                const uniqueIds = [...new Set(selectedProducts.map((p) => p.id).filter(Boolean))];

                return wixData.replaceReferences(
                    "BuildAQuote",
                    "products",
                    quoteId,
                    uniqueIds, { suppressAuth: true }
                );
            })
            .then(() => {
                // 3) Build derived fields
                const qtyMap = selectedProducts.map((p) => ({
                    productId: p.id,
                    sku: p.sku,
                    qty: p.qty,
                    price: p.price || 0,
                }));

                const productsEmailSummary = buildProductsEmailSummary(selectedProducts);

                // 4) Merge onto the FULL existing item
                const toUpdate = {
                    ...existingQuote, // preserves firstName, email, company, UTMs, etc.
                    productsQuantitiesJson: qtyMap,
                    productsEmailSummary,
                };

                // 5) Update record
                return wixData.update("BuildAQuote", toUpdate, { suppressAuth: true });
            })
            .then((updated) => {
                // 6) Send confirmation email, then return response payload
                return sendQuoteConfirmation(updated).then(() => ({
                    success: true,
                    updated,
                }));
            })
            .catch((err) => {
                console.error("Backend quote processing failed:", err);
                // Preserve original behavior: throw so caller gets an error
                throw err;
            });
    }
);

// Build the email summary text using prices from selectedProducts
function buildProductsEmailSummary(products = []) {
    if (!products.length) {
        return 'No products were selected.';
    }

    let total = 0;

    const lines = products.map(p => {
        const unit = Number(p.price) || 0;
        const lineTotal = unit * p.qty;

        if (!unit) {
            return `• ${p.sku} × ${p.qty} (price to be confirmed)`;
        }

        total += lineTotal;
        return `• ${p.sku} × ${p.qty} @ $${unit.toFixed(2)} = $${lineTotal.toFixed(2)}`;
    });

    const totalLine = `Total (parts only): $${total.toFixed(2)}`;

    return [
        'Requested Parts:',
        ...lines,
        '----------------------',
        totalLine
    ].join('\n');
}

import { extendedFields } from "wix-crm.v2";
const elevatedQueryExtendedFields = elevate(extendedFields.queryExtendedFields)

export const myQueryExtendedFieldsFunction = webMethod(
    Permissions.Admin,
    async () => {
        try {
            const queryResults = await elevatedQueryExtendedFields().find();

            const items = queryResults.items;
            return items;
        } catch (error) {
            console.error(error);
            // Handle the error
        }
    }
)

export const testCreateContact = webMethod(
    Permissions.Admin,
    () => {
        return createOrGetContactId({
            "email": "asdf@upcode.com",
            "firstName": "test",
            "lastName": "user",
            "company": "test co",
            "gclid": "1234",
            "utm_source": "google",
            "utm_medium": "search",
            "utm_campaign": "1234",
            "utm_content": "testing",
            "utm_term": "60 days"
        })
    }
)
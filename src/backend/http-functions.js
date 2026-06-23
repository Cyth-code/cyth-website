import { ok, forbidden } from "wix-http-functions";
import { mediaManager } from "wix-media-backend";
import wixData from "wix-data";

const API_SECRET = "98ec83f1341a0c60707f81daa06b11411c4b89a9ba8d0792c0b9cb2d4df7c834";
const COLLECTION = "Import913";

function checkAuth(request) {
  return request.headers["x-api-secret"] === API_SECRET;
}

// Returns a pre-signed upload URL for large files (>700KB).
// The Node uploader calls this first, then POSTs the file directly to the returned URL.
// Files land in /product-docs/<sku>/ in the Media Manager.
export function post_getUploadUrl(request) {
  if (!checkAuth(request)) return forbidden();

  return request.body.json().then((body) => {
    return mediaManager.getUploadUrl("/product-docs/" + body.sku, {
      mediaOptions: { mimeType: "application/pdf", mediaType: "document" },
      metadataOptions: { isPrivate: false, isVisitorUpload: false },
    }).then((result) => ok({ body: JSON.stringify(result) }));
  });
}

// Uploads a small file (<700KB) via base64 POST body.
// Returns the wix:document:// URL of the uploaded file.
export function post_uploadDoc(request) {
  if (!checkAuth(request)) return forbidden();

  return request.body.json().then((body) => {
    const buffer = Buffer.from(body.fileBase64, "base64");
    return mediaManager.upload(
      "/product-docs/" + body.sku,
      buffer,
      body.fileName,
      {
        mediaOptions: { mimeType: "application/pdf", mediaType: "document" },
        metadataOptions: { isPrivate: false, isVisitorUpload: false },
      }
    ).then((result) => ok({ body: JSON.stringify({ fileUrl: result.fileUrl }) }));
  });
}

// Writes the final list of document URLs for a SKU to the product_docs CMS collection.
// Upserts: updates the existing row if one exists, inserts a new row otherwise.
// Accepts an empty fileUrls array to create a placeholder row for SKUs with no docs.
export function post_commitSkuDocs(request) {
  if (!checkAuth(request)) return forbidden();

  return request.body.json().then((body) => {
    const { sku, fileUrls } = body;

    return wixData.query(COLLECTION)
      .eq("sku", sku)
      .find({ suppressAuth: true })
      .then((results) => {
        const existing = results.items[0];
        const item = existing
          ? { ...existing, documents: fileUrls }
          : { sku, documents: fileUrls };

        const op = existing
          ? wixData.update(COLLECTION, item, { suppressAuth: true })
          : wixData.insert(COLLECTION, item, { suppressAuth: true });

        return op.then((saved) =>
          ok({ body: JSON.stringify({ sku: saved.sku, urls: saved.documents }) })
        );
      });
  });
}

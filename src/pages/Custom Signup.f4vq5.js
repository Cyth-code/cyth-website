import { TrackingManager } from "public/TrackingManager";

$w.onReady(() => {
  // Capture & store values (and/or apply to other forms if you want)
  const tm = new TrackingManager();
  const vals = tm.getValues();
	console.log(vals)
  // If you wrapped hidden inputs in a box:
  // $w("#trackingBox").collapse();
  // $w("#trackingBox").hide();

  // Prefill hidden signup fields (IDs must match your actual elements)
  setIfExists("#gclidInput", vals.gclid);
  setIfExists("#utmSourceInput", vals.utm_source);
  setIfExists("#utmMediumInput", vals.utm_medium);
  setIfExists("#utmCampaignInput", vals.utm_campaign);
  setIfExists("#utmContentInput", vals.utm_content);
  setIfExists("#utmTermInput", vals.utm_term);
});

function setIfExists(selector, value) {
  try {
    const el = $w(selector);
    if (!el) return;
	console.log(`setting ${selector} to ${value}`)
    // Only set if we have a real value (prevents overwriting any defaults)
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      el.value = String(value).trim();
    }
  } catch (e) {
    // If an element doesn't exist on this page/lightbox, no problem
  }
}

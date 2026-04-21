// public/TrackingManager.js
import { local } from 'wix-storage';
import wixLocation from 'wix-location';

/**
 * TrackingManager Class (Wix Velo)
 * -----------------------------------
 * Automatically captures UTM and GCLID tracking parameters from the URL,
 * stores them in `local` storage, and populates hidden form fields on the page.
 *
 * Features:
 * - Extracts specified tracking parameters from URL and/or local storage.
 * - Applies values to *all* Wix Forms found on the page.
 * - Matches hidden field names directly with tracking keys.
 * - Requires *no manual form ID wiring* — works automatically.
 *
 * Usage:
 * In any page’s code panel, just add:
 *
 *    import { TrackingManager } from 'public/TrackingManager';
 *    TrackingManager.autoInitialize();
 *
 * Customization:
 * - To use custom tracking keys, you can instantiate manually instead:
 *
 *    const tracker = new TrackingManager(["ref", "fbclid"]);
 *    $w.onReady(() => tracker.applyToForms());
 *
 * Author: UpCode
 * Last Updated: July 2025
 */

export class TrackingManager {
    constructor(trackingKeys = [
        "gclid",
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content",
        "utm_term"
    ]) {
        this.trackingKeys = trackingKeys;
        this.trackingValues = this.loadTrackingData();
        this.applicableValues = {};

        this.trackingKeys.forEach(key => {
            this.applicableValues[key] = this.trackingValues[key];
        });
    }

    /**
     * Load tracking data from local storage and URL, and update local if new ones exist
     */
    loadTrackingData() {
        const values = {};

        this.trackingKeys.forEach(key => {
            const urlValue = wixLocation.query[key];
            if (urlValue !== undefined) {
                local.setItem(key, urlValue);
                values[key] = urlValue;
            } else {
                const stored = local.getItem(key);
                if (stored !== undefined && stored !== null) {
                    values[key] = stored;
                }
            }
        });

        return values;
    }

    /**
     * Apply tracking values to a form by ID (Form V2 only)
     * @param {string} formSelector - Element ID string, e.g. "#utmTrackingForm"
     */
    applyToFormById(formSelector = '#utmTrackingForm') {
        const form = $w(formSelector);

        //if (!form || typeof form.setFieldValues !== 'function') {
        if (!form) {
            console.warn(`TrackingManager: No form found with selector '${formSelector}'.`);
            return;
        }

        if (Object.keys(this.applicableValues).length > 0) {
            if (form && typeof form.setFieldValues == 'function') {
                // @ts-ignore
                form.setFieldValues(this.applicableValues);
            }
        }
    }

    /**
     * Static method to auto-run tracking injection on page load
     * @param {string} formSelector - ID of the form to target (e.g. "#utmTrackingForm")
     */
    static autoInitialize(formSelector = '#utmTrackingForm') {
        const manager = new TrackingManager();
        $w.onReady(() => {
            manager.applyToFormById(formSelector);
        });
        return manager
    }

    getValues(){
        return this.applicableValues
    }
}
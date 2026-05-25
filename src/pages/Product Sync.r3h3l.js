import { processNextSeoBatch, getImportStatus, refreshSkuMap } from "backend/productSync.web.js";

const BATCH_SIZE = 25; // CHANGED: was 2 — that was the main cause of last night's failure cascade
const PAUSE_BETWEEN_BATCHES_MS = 500;
const PAUSE_ON_ERROR_MS = 3000; // CHANGED: longer backoff on errors
let isRunning = false;
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 5; // CHANGED: hard abort if backend is hosed

$w.onReady(() => {
  $w("#startButton").onClick(startButton_click);
  $w("#stopButton").onClick(stopButton_click);
});

export function startButton_click() {
  console.log("Starting SEO update...");
  if (isRunning) return;
  isRunning = true;
  consecutiveFailures = 0;

  // CHANGED: show remaining count once at the start, not on every batch
  getImportStatus().then((s) => {
    console.log(`Starting with ${s.remaining} rows remaining`);
    runLoop();
  });
}

export function stopButton_click() {
  console.log("Stopping SEO update...");
  isRunning = false;
}

function runLoop() {
  if (!isRunning) return;

  processNextSeoBatch(BATCH_SIZE)
    .then((res) => {
      console.log("Batch:", res);

      // Track consecutive failures (batches where nothing succeeded)
      if (res.processed > 0 && res.updated === 0) {
        consecutiveFailures++;
        console.warn(`Consecutive failed batches: ${consecutiveFailures}`);
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.error(
            `Aborting: ${MAX_CONSECUTIVE_FAILURES} consecutive batches with zero updates. ` +
            `Backend likely degraded. Check the Last Error column on recent rows.`
          );
          isRunning = false;
          return;
        }
      } else if (res.updated > 0) {
        consecutiveFailures = 0;
      }

      if (!res.continue) {
        console.log("Done — no more rows to process.");
        isRunning = false;
        return;
      }

      setTimeout(runLoop, PAUSE_BETWEEN_BATCHES_MS);
    })
    .catch((err) => {
      console.error("Batch threw:", err);
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error("Aborting: too many consecutive errors.");
        isRunning = false;
        return;
      }
      setTimeout(runLoop, PAUSE_ON_ERROR_MS);
    });
}

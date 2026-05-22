import { processNextSeoBatch, getImportStatus } from "backend/productSync.web.js";

let isRunning = false;

$w.onReady(() => {
  $w("#startButton").onClick(startButton_click)
  $w("#stopButton").onClick(stopButton_click)
})

export function startButton_click() {
  console.log("starting seo update..")
  if (isRunning) return;
  isRunning = true;

  runLoop();
}

export function stopButton_click() {
  console.log("stopping seo update..")
  isRunning = false;
}

function runLoop() {
  if (!isRunning) return;

  // Always do a quick remaining check so we stop correctly
  getImportStatus()
    .then((s) => {
      if (s.remaining <= 0) {
        console.log("Done!");
        isRunning = false;
        return;
      }

      return processNextSeoBatch(2).then((res) => {
        console.log("Batch:", res);

        // small pause keeps the UI responsive + avoids hammering
        setTimeout(runLoop, 200);
      });
    })
    .catch((err) => {
      console.log("Error:", err);
      // back off on errors
      setTimeout(runLoop, 1000);
    });
}

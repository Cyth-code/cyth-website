import wixData from 'wix-data'

let debounceTimer;            // holds timeout id
const DEBOUNCE_MS = 250;      // tweak this (150–400 is common)

$w.onReady(function () {
  $w('#searchInput').onInput(() => {
    const searchValue = $w('#searchInput').value.trim()

    // clear any pending filter call
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }

    // wait for user to pause typing
    debounceTimer = setTimeout(() => {
      if (!searchValue || searchValue === '') {
        // empty = reset dataset
        $w('#dynamicDataset').setFilter(wixData.filter())
        return
      }

      $w('#dynamicDataset').setFilter(
        wixData.filter().contains('title_fld', searchValue)
      )
    }, DEBOUNCE_MS)
  })
})
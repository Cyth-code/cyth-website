// Velo API Reference: https://www.wix.com/velo/reference/api-overview/introduction

$w.onReady(function () {
	$w("#dynamicDataset").onReady(() => {
		const currentEvent = $w("#dynamicDataset").getCurrentItem()
		if(currentEvent.showRsvp){
			$w("#rsvpSection").expand()
			$w("#rsvpButton").expand()
		}

		const formValues = {
			"event_interested_in_1": currentEvent.title
		}
		$w("#form1").setFieldValues(formValues)
	})

});
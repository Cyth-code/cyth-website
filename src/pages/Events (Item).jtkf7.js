// Velo API Reference: https://www.wix.com/velo/reference/api-overview/introduction

$w.onReady(function () {
	$w("#dynamicDataset").onReady(() => {
		const currentEvent = $w("#dynamicDataset").getCurrentItem()
		const rsvpSection = $w("#rsvpSection");
		const rsvpButton = $w("#rsvpButton");

		if(currentEvent?.show_rsvp){
			rsvpSection.expand?.()
			rsvpButton.expand?.()
		}

		rsvpButton.onClick(() => {
			rsvpSection.scrollTo?.();
		});

		const formValues = {
			"event_interested_in_1": currentEvent.title
		}
		$w("#form1").setFieldValues(formValues)
	})

});

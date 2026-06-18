// Velo API Reference: https://www.wix.com/velo/reference/api-overview/introduction

import { L, E } from 'backend/logger.web';

$w.onReady(function () {
	$w("#dynamicDataset").onReady(() => {
		

		try
		{
			
			const currentEvent = $w("#dynamicDataset").getCurrentItem()
			const engineerSection = $w("#rsvpSection");
			const reserveSection = $w("#section71");

			if(currentEvent?.engineer_form){ //field ID for "Connect with and Engineer" 
				engineerSection.expand?.()
			}

			if(currentEvent?.show_rsvp){
				reserveSection.expand?.();
			}

			const formValues = {
				"event_interested_in_1": currentEvent.title
			}
			$w("#form1").setFieldValues(formValues);

		}
		catch(err){E("Events (Item)", err)}
	})

});

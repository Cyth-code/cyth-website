import { L, E } from 'backend/logger.web';

$w.onReady(function () {
  $w("#dynamicDataset").onReady(() => {

    try {
      const currentEvent = $w("#dynamicDataset").getCurrentItem();
      const engineerSection = $w("#rsvpSection");
      const reserveSection = $w("#section71");

      if (currentEvent?.engineer_form) {
        engineerSection.expand?.()
      }

      if (currentEvent?.show_rsvp) {
        reserveSection.expand?.();
      }

      const formValues = {
        "event_interested_in_1": currentEvent.title
      }
      $w("#form1")?.setFieldValues?.(formValues);

      const saveMySpotValues = {
        "event_name": currentEvent.title || '',
        "event_date": currentEvent.date ? new Date(currentEvent.date).toDateString() : '',
        "event_location": currentEvent.location || '',
        "booth_number": currentEvent.boothNumber || ''
      }

      $w("#form2")?.onSubmit?.(() => {
        console.log("form2 submit fired, setting values:", saveMySpotValues);
        $w("#form2").setFieldValues(saveMySpotValues);
      });

    } catch (err) { E("Events (Item)", err) }
  })
});

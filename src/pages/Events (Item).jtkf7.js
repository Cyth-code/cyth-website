import { L, E } from 'backend/logger.web';
import { insertEventRegistrationTag } from 'backend/eventRegistration.jsw';

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

      $w("#form2")?.onSubmit?.(() => {
        try {
          const visitorFields = $w("#form2").getFieldValues();

          insertEventRegistrationTag({
            email: visitorFields.email_c840 || '',
            firstName: visitorFields.first_name_e71b || '',
            lastName: visitorFields.last_name_1971 || '',
            companyName: visitorFields.company_name_5256 || '',
            eventName: currentEvent.title || '',
            eventDate: currentEvent.date ? new Date(currentEvent.date).toDateString() : '',
            eventLocation: currentEvent.location || '',
            boothNumber: currentEvent.boothNumber || ''
          });
        } catch (innerErr) {
          E("Events (Item) - tag insert", innerErr);
        }
      });

    } catch (err) { E("Events (Item)", err) }
  })
});

import { authentication, currentMember } from 'wix-members';
import wixLocation from 'wix-location';

const DATASET_SEL = '#dynamicDataset';
const MSB_SEL = '#multiStateBox';

let activeButtonSelector = null;

$w.onReady(() => {
  $w(DATASET_SEL).onReady(() => {
    dynamicdataset_ready()
    const item = $w(DATASET_SEL).getCurrentItem();

    // collect all buttons whose id starts with "btn"
    const navButtons = [];
    $w('Button').forEach((btn) => {
      if (btn.id && btn.id.startsWith('btn')) {
        navButtons.push(btn);
      }
    });

    let firstVisible = null;

    navButtons.forEach((btn) => {
      const btnId = btn.id;           // e.g. "btn3"
      const index = btnId.replace('btn', ''); // "3"
      const fieldKey = `tab${index}Title`;     // "tab3Title"
      const stateId = `state${index}`;        // "state3"

      const value = item[fieldKey];
      const hasContent = fieldHasContent(value);
      // console.log(item)

      if (hasContent) {
        btn.show();
        btn.expand && btn.expand();

        // avoid capturing stale values by building selector here
        const buttonSelector = `#${btnId}`;

        btn.onClick(() => switchSection(buttonSelector, stateId));

        if (!firstVisible) {
          firstVisible = { buttonSelector, stateId };
        }
      } else {
        btn.hide();
        btn.collapse && btn.collapse();
      }
    });

    if (firstVisible) {
      switchSection(firstVisible.buttonSelector, firstVisible.stateId);
    } else {
      // no visible sections, hide the multistate box
      $w(MSB_SEL).hide();
    }
  });
});

function fieldHasContent(value) {
  if (!value) return false;

  // supports plain text or rich text (strip tags/&nbsp;)
  const str = String(
    typeof value === 'object' ? JSON.stringify(value) : value
  )
    .replace(/<[^>]*>/g, '')   // strip HTML tags
    .replace(/&nbsp;/g, ' ')
    .trim();

  return str.length > 0;
}

function switchSection(buttonSelector, stateId) {
  // change multistate state
  $w(MSB_SEL).changeState(stateId);

  // reset previous active button style
  if (activeButtonSelector) {
    const $prev = $w(activeButtonSelector);
    if ($prev && $prev.style) {
      $prev.customClassList.remove("selected-button")
    }
  }

  // apply active style to new button
  const $btn = $w(buttonSelector);
  if ($btn && $btn.style) {
    $btn.customClassList.add("selected-button")
  }

  activeButtonSelector = buttonSelector;

  // optional: scroll content into view
  // $w(MSB_SEL).scrollTo();
}

export async function dynamicdataset_ready(){
  // Get the entire current item
  const recipe = $w("#dynamicDataset").getCurrentItem();
  
  if(recipe.isMembersOnly){ //Check those member permissions!
    
  const member = await (currentMember.getMember());
    if (member) console.log('Is Logged In')
    else {
        try {

            await authentication.promptLogin({ modal: true, mode: 'login' })
            console.log("Logged in successfully")
        } catch (err) {
            console.error("Didn't successfully login - ", err);
            wixLocation.to('/home');
        }
    }  
  }
} 

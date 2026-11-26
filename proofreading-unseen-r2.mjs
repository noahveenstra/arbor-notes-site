// Round-2 independent unseen test corpus (283 sentences: 168 clean, 115 errors).
// Written fresh after commit 189c7831; no shared wording with fresh_corpus.mjs,
// proofreading-fresh.mjs, proofreading-holdout.mjs, or holdout.json.

function clean(category, items) {
  return items.map((item, idx) => {
    const text = typeof item === "string" ? item : item.text;
    const prot = typeof item === "string" ? [] : (item.protected || []);
    return {
      id: `r2-${category}-${String(idx + 1).padStart(2, "0")}`,
      category,
      text,
      expect: [],
      protected: prot,
      acceptableOutputs: null,
      detectOnlyOk: false
    };
  });
}

function err(category, items) {
  return items.map((item, idx) => ({
    id: `r2-${category}-${String(idx + 1).padStart(2, "0")}`,
    category,
    text: item.text,
    expect: item.expect,
    protected: item.protected || [],
    acceptableOutputs: item.acceptableOutputs || null,
    detectOnlyOk: Boolean(item.detectOnlyOk)
  }));
}

// ---------------- CLEAN SENTENCES (168) ----------------

const casualLowercaseClean = clean("casual-lowercase-clean", [
  "woke up early and made oats before anyone else stirred.",
  "i should probably fold that laundry before dinner.",
  "not convinced the second section pulls its weight yet.",
  "dropped the library books in the return slot on my way home.",
  "honestly i only skimmed the appendix last night.",
  "might bike over to the river trail if the wind dies down.",
  "i still have half a loaf of rye bread in the freezer.",
  "forgot to plug in my headphones so they are completely dead.",
  "let me check my notes real quick before we hop on.",
  "yeah i can grab paper towels on the way back.",
  "the radiator clicked all night and kept me half awake.",
  "i keep meaning to organize the hallway closet.",
  "looks like the fog finally lifted around ten.",
  "just finished sweeping the front steps.",
  "i could listen to that acoustic record on repeat all week.",
  "turns out the spare battery was sitting in my coat pocket.",
  "probably best if we hold off until everyone has weighed in.",
  "i took the back road to avoid the highway construction.",
  "left my umbrella at the cafe again, of course.",
  "feeling much clearer after an hour away from screens.",
  "i can swing by real quick after picking up groceries.",
  "no need to rush the outline tonight.",
  "barely slept because the neighbor's motion light kept blinking.",
  "i liked the first sketch better than the polished one."
]);

const notesListsClean = clean("notes-lists-clean", [
  "- olive oil, chickpeas, and smoked paprika",
  { text: "- [ ] confirm soundcheck time with Tomasz", protected: ["Tomasz"] },
  { text: "- [x] upload revised handout for Sunday", protected: ["Sunday"] },
  "1. open with a short welcome",
  "2. invite questions from the back rows",
  "3. close with announcements",
  "Errands: hardware store, post office, pharmacy",
  "Topic: winter retreat logistics",
  "Reminder: bring extension cords and gaffer tape",
  "- check tire pressure before Saturday",
  "Call Mom before seven",
  "Draft outline for October newsletter",
  "- because the side entrance stays locked after six",
  "Groceries: apples, walnuts, plain yogurt",
  "Notes from Wednesday's planning call",
  "- tighten the intro paragraph",
  "Backup plan: move chairs into the fellowship hall",
  "Things to pack: rain shell, wool socks, headlamp"
]);

const scriptureSermonClean = clean("scripture-sermon-clean", [
  { text: "Read John 3:16 slowly before jumping into the commentary.", protected: ["John 3:16"] },
  { text: "1 Cor 13:4-7 frames love in terms of patience and endurance.", protected: ["1 Cor 13:4-7"] },
  { text: "We spent twenty minutes unpacking Rom 12:1-2.", protected: ["Rom 12:1-2"] },
  { text: "Eph 2:8-9 was printed at the top of the bulletin.", protected: ["Eph 2:8-9"] },
  { text: "The call to worship came straight from Ps 23:1-4.", protected: ["Ps 23:1-4"] },
  { text: "Starting at Gen 1:1 sets the cadence for the whole series.", protected: ["Gen 1:1"] },
  { text: "Check how 2 Tim 3:16 connects teaching with practice.", protected: ["2 Tim 3:16"] },
  { text: "Phil 4:13 is often quoted without the verses before it.", protected: ["Phil 4:13"] },
  { text: "The benediction closed with Rev 21:4.", protected: ["Rev 21:4"] },
  "Sermon title: Ordinary Faithfulness in Loud Times",
  "Grace meets people in the middle of ordinary grief.",
  "Advent readings begin four Sundays before Christmas.",
  { text: "Compare Isa. 40:31 with Heb. 12:1-2 in your small group.", protected: ["Isa. 40:31", "Heb. 12:1-2"] },
  "The acoustic guitar sat out the final hymn.",
  "Remember to leave ten minutes for silent reflection.",
  { text: "Ask Deacon Chidi to lead the closing prayer.", protected: ["Deacon", "Chidi"] }
]);

const emailsTextsClean = clean("emails-texts-clean", [
  { text: "Hey Yuki, could you glance at the slides real quick?", protected: ["Yuki"] },
  { text: "Thanks Soraya, I received the signed contract this morning.", protected: ["Soraya"] },
  "Running ten minutes late because traffic stalled near the bridge.",
  "Attached are the updated numbers for the third quarter.",
  { text: "Let me know if Friday at two still fits your calendar.", protected: ["Friday"] },
  "Appreciate the quick turnaround on those edits.",
  "Can we move our check-in to tomorrow afternoon instead?",
  "Just wanted to follow up before the end of the day.",
  "Happy to jump on a brief call whenever you have a window.",
  "I'll forward the receipt as soon as it lands in my inbox.",
  "Sounds good, see you by the east entrance.",
  "No problem at all—take whatever time you need.",
  { text: "Looping in Ibrahim so everyone has the same timeline.", protected: ["Ibrahim"] },
  "Thanks again for covering the early shift.",
  "Could you resend the link with edit access enabled?",
  "Left the folders on the reception desk for you.",
  "All set on my end, ready whenever you are.",
  "Safe travels tonight and text when you get in."
]);

const questionsClean = clean("questions-clean", [
  "Did anyone remember to turn off the porch heater?",
  "How many volunteers signed up for Saturday morning?",
  "Which bus stops closest to the conservatory?",
  "Have you tasted the new soup yet?",
  "Why was the meeting moved downstairs?",
  "Who brought the extra folding tables?",
  "When does the hardware store close on Sundays?",
  "Where did we store the spare microphone cables?",
  "Could you pass the salt shaker?",
  "Would Monday morning work better for your team?",
  "Is the trail still muddy after yesterday's rain?",
  "What made you change the opening sentence?",
  "Are there any clean mugs left in the cupboard?",
  "Whose thermos is sitting on the radiator?"
]);

const namesCultureClean = clean("names-culture-clean", [
  { text: "Nkechi and Rafaela split the driving on the way north.", protected: ["Nkechi", "Rafaela"] },
  { text: "Ask @joonho if the staging deploy finished.", protected: ["@joonho"] },
  { text: "Tagging #sermon-prep so we can find this later.", protected: ["#sermon-prep"] },
  { text: "Astrid brought cardamom buns from the bakery.", protected: ["Astrid"] },
  { text: "Ximena and Padma reviewed the accessibility checklist.", protected: ["Ximena", "Padma"] },
  { text: "Send @zainab the updated floor plan before noon.", protected: ["@zainab"] },
  { text: "We met Bjorn and Mireille outside the train station.", protected: ["Bjorn", "Mireille"] },
  { text: "Kazuo tuned the upright piano yesterday.", protected: ["Kazuo"] },
  { text: "Siobhan knows the neighborhood better than anyone.", protected: ["Siobhan"] },
  { text: "Please cc @chidi on any #budget revisions.", protected: ["@chidi", "#budget"] },
  { text: "O'Malley's hardware shop has the brass hinges in stock.", protected: ["O'Malley's"] },
  { text: "Both Mei-Ling and Tariq volunteered to host.", protected: ["Mei-Ling", "Tariq"] },
  { text: "Yael sent three photos from the museum exhibit.", protected: ["Yael"] },
  { text: "Tell Kwame we pushed rehearsal back thirty minutes.", protected: ["Kwame"] },
  { text: "Aoife prefers tea over coffee in the afternoon.", protected: ["Aoife"] },
  { text: "Check with @soraya in #ops before restarting the job.", protected: ["@soraya", "#ops"] },
  { text: "The Alvarez family moved two streets over.", protected: ["Alvarez"] },
  { text: "Fatima presented the quarterly findings clearly.", protected: ["Fatima"] }
]);

const timesUrlsCodeClean = clean("times-urls-code-clean", [
  "Doors open at 7:45am and close promptly at 9:30pm.",
  "Our train departs at 4:20 pm from platform six.",
  "The bakery opens at 6:30 sharp every weekday.",
  "We blocked 11:05 to 11:45 for feedback.",
  { text: "Read the guide at https://arbor.example.org/docs before installing.", protected: ["https://arbor.example.org/docs"] },
  { text: "Release notes are posted on https://notes.usearbor.app/changelog now.", protected: ["https://notes.usearbor.app/changelog"] },
  { text: "Try www.example.com/guide if the local mirror fails.", protected: ["www.example.com/guide"] },
  { text: "Write to support@example.org with your account ID.", protected: ["support@example.org"] },
  { text: "Check `git status` before switching branches.", protected: ["`git status`"] },
  { text: "We set `maxTokens: 512` in the worker config.", protected: ["`maxTokens: 512`"] },
  { text: "Issue ARB-412 tracks the sync retry backoff.", protected: ["ARB-412"] },
  "The warranty covers 2-3 business days of shipping.",
  "Measure 1.75 cups of warm water for the dough.",
  "Temperatures dipped below 18 degrees overnight.",
  "Flight 402 boards at gate B14.",
  "We saved $240 by booking two weeks ahead."
]);

const britishSpellingsClean = clean("british-spellings-clean", [
  "The autumn colour along the ridge looked surreal.",
  "We wanted to honour her years of quiet service.",
  "Heavy fog meant the ferry crossing was cancelled.",
  "She spent three months travelling across Scotland by rail.",
  "The community theatre sold out every weekend show.",
  "Walk two blocks past the town centre to find the bookshop.",
  "Our printed programme lists every speaker in order.",
  "Could you do me a small favour before locking up?",
  "The whole neighbourhood gathered on the lawn.",
  "He mailed the rent cheque on Monday morning.",
  "Honest dialogue takes more patience than debate.",
  "Her judgement on the layout saved us hours.",
  "A hint of citrus lifts the flavour of the broth.",
  "Thick grey clouds settled over the harbor."
]);

const trickyCleanProse = clean("tricky-clean-prose", [
  "The jury is still deliberating behind closed doors.",
  "The jury are divided on the second count.",
  "Yesterday she read forty pages before falling asleep.",
  "He cut the sourdough loaf into thick slices.",
  "She set the brass candlesticks on the mantle.",
  "He put his boots by the back radiator.",
  "The repair cost far less than we feared.",
  "If he were here, he would tell us straight away.",
  "The committee recommended that she wait until spring.",
  "It is essential that he sign both pages.",
  "The stack of folders is sitting on my desk.",
  "The boxes in the attic were covered in dust.",
  "Neither of them is ready to move yet.",
  "Everyone has a spare key to the shed.",
  "Useful advice rarely arrives when you expect it.",
  "Plenty of luggage fits inside the trunk.",
  "Recent research shows steady gains over time.",
  "Because the ferry stopped, we drove around the bay.",
  "Although it rained, everyone stayed for the picnic.",
  "Since the oven broke, we ordered soup instead.",
  "Swimming in cold lake water wakes you right up.",
  "Reading aloud helps catch clunky phrasing.",
  "A few deer crossed the gravel road at dusk.",
  "Ten miles is a long walk in wet boots.",
  "Fish and chips remains the Friday special.",
  "Each of the volunteers wears a green lanyard.",
  "None of the bread was stale.",
  "Two third-floor windows were left cracked open.",
  "Their arriving early gave us time to set up.",
  "Neither the coach nor the players were surprised."
]);

// ---------------- ERROR SENTENCES (115) ----------------

const misspellingsErrors = err("misspellings", [
  { text: "We can acommodate twelve guests in the hall.", expect: ["accommodate"] },
  { text: "She is definately coming to the rehearsal.", expect: ["definitely"] },
  { text: "Keep the receipts in a seperate folder.", expect: ["separate"] },
  { text: "He forgot to mark the trip on his calender.", expect: ["calendar"] },
  { text: "I didn't mean to embarass anyone at dinner.", expect: ["embarrass"] },
  { text: "Building maintainance starts early on Monday.", expect: ["maintenance"], protected: ["Monday"] },
  { text: "The drummer kept a steady rythm all night.", expect: ["rhythm"] },
  { text: "Bring only what is neccessary for three days.", expect: ["necessary"] },
  { text: "Parking in the courtyard is a rare priviledge.", expect: ["privilege"] },
  { text: "Everyone filled out the short questionaire.", expect: ["questionnaire"] },
  { text: "One flourescent bulb flickered over the sink.", expect: ["fluorescent"] },
  { text: "We finally reached a concensus on the name.", expect: ["consensus"] },
  { text: "That glitch became a daily occurence.", expect: ["occurrence"] },
  { text: "I will wait untill the kettle whistles.", expect: ["until"] }
]);

const agreementVariedErrors = err("agreement-varied", [
  { text: "The list of items are taped to the fridge.", expect: ["is"] },
  { text: "Everyone have a copy of the handout.", expect: ["has"] },
  { text: "Neither of them are able to drive tonight.", expect: ["is"] },
  { text: "Each of the players have a clean jersey.", expect: ["has"] },
  { text: "A box of apples were left on the porch.", expect: ["was"] },
  { text: "Nobody know where the spare fuses went.", expect: ["knows"] },
  { text: "The quality of these photos are impressive.", expect: ["is"] },
  { text: "One of my friends live near the harbor.", expect: ["lives"] },
  { text: "Either Sam or Maya are bringing ice.", expect: ["is"], protected: ["Sam", "Maya"] },
  { text: "Both of the doors is unlocked right now.", expect: ["are"] },
  { text: "My neighbor walk past here every morning.", expect: ["walks"] },
  { text: "The dogs barks whenever a cyclist passes.", expect: ["bark"] },
  { text: "She always forget to latch the side gate.", expect: ["forgets"] },
  { text: "The price of eggs have climbed again.", expect: ["has"] }
]);

const pluralsErrors = err("plurals", [
  { text: "We installed three shelf in the pantry.", expect: ["shelves"] },
  { text: "The park has five wooden bench along the path.", expect: ["benches"] },
  { text: "Two child waited under the awning.", expect: ["children"] },
  { text: "The dentist checked four tooth on the left side.", expect: ["teeth"] },
  { text: "Several mouse nested behind the grain bin.", expect: ["mice"] },
  { text: "I bought four padded envelope at the counter.", expect: ["envelopes"] },
  { text: "They carried two heavy suitcase upstairs.", expect: ["suitcases"] },
  { text: "Five umbrella stood in the ceramic stand.", expect: ["umbrellas"] }
]);

const tenseErrors = err("tense", [
  { text: "I seen that documentary twice already.", expect: ["saw"], acceptableOutputs: ["I saw that documentary twice already.", "I have seen that documentary twice already.", "I've seen that documentary twice already."] },
  { text: "He has went to the hardware store.", expect: ["gone"] },
  { text: "Yesterday I go straight home after work.", expect: ["went"] },
  { text: "Last summer we swim across the cove every day.", expect: ["swam"] },
  { text: "She has drank all the cold brew.", expect: ["drunk"] },
  { text: "He had ran three miles before sunrise.", expect: ["run"] },
  { text: "Earlier today he tell me the roof leaked.", expect: ["told"] },
  { text: "Did she forgot her glasses on the train?", expect: ["forget"] },
  { text: "Does he knows the combination to the lock?", expect: ["know"] },
  { text: "Last night I buy fresh basil at the market.", expect: ["bought"] }
]);

const articlesErrors = err("articles", [
  { text: "We waited over a hour in the lobby.", expect: ["an"] },
  { text: "She applied to an university in Montreal.", expect: ["a"], protected: ["Montreal"] },
  { text: "Grab a umbrella before stepping outside.", expect: ["an"] },
  { text: "He met an European sculptor at the gallery.", expect: ["a"], protected: ["European"] },
  { text: "Give me a honest answer about the timeline.", expect: ["an"] },
  { text: "Turn left onto an one-way street.", expect: ["a"] },
  { text: "I packed a apple and some almonds.", expect: ["an"] },
  { text: "They rented an house near the lake.", expect: ["a"] }
]);

const homophonesErrors = err("homophones", [
  { text: "We walked too the station in the drizzle.", expect: ["to"] },
  { text: "There is to much salt in this broth.", expect: ["too"] },
  { text: "The morning breeze felt two cold for shorts.", expect: ["too"] },
  { text: "This route is faster then the coastal highway.", expect: ["than"] },
  { text: "I would rather read outside then sit inside.", expect: ["than"] },
  { text: "The drought will effect next year's harvest.", expect: ["affect"] },
  { text: "Sleep had a positive affect on her mood.", expect: ["effect"] },
  { text: "Its obvious the hinge needs oil.", expect: ["It's"] },
  { text: "The hound wagged it's tail by the stove.", expect: ["its"] },
  { text: "Your right about checking the valves first.", expect: ["You're"] },
  { text: "Grab you're backpack before the bus pulls up.", expect: ["your"] },
  { text: "Whose bringing the thermos of cider?", expect: ["Who's"] },
  { text: "Who's wool coat is hanging in the hall?", expect: ["Whose"] },
  { text: "Try not to loose your parking stub.", expect: ["lose"] },
  { text: "Their arriving right after the five o'clock bell.", expect: ["They're"] }
]);

const contractionsErrors = err("contractions", [
  { text: "We cant leave until the inspector signs off.", expect: ["can't"] },
  { text: "I dont recognize that street name.", expect: ["don't"] },
  { text: "The latch doesnt catch unless you lift it.", expect: ["doesn't"] },
  { text: "They didnt hear the knock over the fan.", expect: ["didn't"] },
  { text: "The oven wasnt hot enough for sourdough.", expect: ["wasn't"] },
  { text: "You werent kidding about the steep stairs.", expect: ["weren't"] },
  { text: "That shortcut isnt open during winter.", expect: ["isn't"] },
  { text: "We shouldnt skip the pressure test.", expect: ["shouldn't"] },
  { text: "Whats the fastest way to the ferry dock?", expect: ["What's"] },
  { text: "Wheres the small Phillips screwdriver?", expect: ["Where's"], protected: ["Phillips"] }
]);

const alotErrors = err("alot", [
  { text: "Alot of neighbors showed up to clear branches.", expect: ["A lot"] },
  { text: "Thanks alot for carrying those crates.", expect: ["a lot"] },
  { text: "Your note really means alot to our team.", expect: ["a lot"] }
]);

const couldOfErrors = err("could-of", [
  { text: "We could of waited ten more minutes.", expect: ["have"] },
  { text: "You should of asked before moving the desk.", expect: ["have"] },
  { text: "She would of helped if someone had called.", expect: ["have"] },
  { text: "I might of missed that footnote.", expect: ["have"] }
]);

const doubleNegativesErrors = err("double-negatives", [
  { text: "We didn't see nobody in the courtyard.", expect: ["anybody"], acceptableOutputs: ["We didn't see anybody in the courtyard.", "We didn't see anyone in the courtyard.", "We saw nobody in the courtyard."] },
  { text: "I don't need nothing else from the store.", expect: ["anything"], acceptableOutputs: ["I don't need anything else from the store.", "I need nothing else from the store."] },
  { text: "She can't hardly wait for spring break.", expect: ["can"], acceptableOutputs: ["She can hardly wait for spring break."] },
  { text: "They haven't got no extra blankets left.", expect: ["any"], acceptableOutputs: ["They haven't got any extra blankets left.", "They have no extra blankets left."] },
  { text: "He wasn't going nowhere near the cliff.", expect: ["anywhere"], acceptableOutputs: ["He wasn't going anywhere near the cliff.", "He was going nowhere near the cliff."] }
]);

const wrongWordFormsErrors = err("wrong-word-forms", [
  { text: "This wool blanket feels more better than the old one.", expect: ["better"], acceptableOutputs: ["This wool blanket feels better than the old one.", "This wool blanket feels much better than the old one."] },
  { text: "That was the most easiest quiz all semester.", expect: ["easiest"], acceptableOutputs: ["That was the easiest quiz all semester."] },
  { text: "We were suppose to meet by the fountain.", expect: ["supposed"] },
  { text: "I am use to walking up four flights.", expect: ["used"] },
  { text: "Dust made it hard to breath inside the barn.", expect: ["breathe"] },
  { text: "The review felt clearly bias against local shops.", expect: ["biased"] }
]);

const runonsCommaSplicesErrors = err("runons-comma-splices", [
  {
    text: "We packed the tent it started raining.",
    expect: ["fragment"],
    detectOnlyOk: true,
    acceptableOutputs: [
      "We packed the tent, and it started raining.",
      "We packed the tent; it started raining.",
      "We packed the tent. It started raining.",
      "We packed the tent, then it started raining.",
      "We packed the tent, but it started raining."
    ]
  },
  {
    text: "She opened the window, a moth flew in.",
    expect: ["fragment"],
    detectOnlyOk: true,
    acceptableOutputs: [
      "She opened the window, and a moth flew in.",
      "She opened the window; a moth flew in.",
      "She opened the window. A moth flew in."
    ]
  },
  {
    text: "The train arrived early, nobody was on the platform.",
    expect: ["fragment"],
    detectOnlyOk: true,
    acceptableOutputs: [
      "The train arrived early, and nobody was on the platform.",
      "The train arrived early, so nobody was on the platform.",
      "The train arrived early; nobody was on the platform.",
      "The train arrived early. Nobody was on the platform."
    ]
  },
  {
    text: "I called twice he never picked up.",
    expect: ["fragment"],
    detectOnlyOk: true,
    acceptableOutputs: [
      "I called twice, and he never picked up.",
      "I called twice, but he never picked up.",
      "I called twice; he never picked up.",
      "I called twice. He never picked up."
    ]
  },
  {
    text: "The coffee cooled down, I reheated it in the microwave.",
    expect: ["fragment"],
    detectOnlyOk: true,
    acceptableOutputs: [
      "The coffee cooled down, so I reheated it in the microwave.",
      "The coffee cooled down; I reheated it in the microwave.",
      "The coffee cooled down. I reheated it in the microwave."
    ]
  },
  {
    text: "He missed the turn, we had to loop around.",
    expect: ["fragment"],
    detectOnlyOk: true,
    acceptableOutputs: [
      "He missed the turn, so we had to loop around.",
      "He missed the turn; we had to loop around.",
      "He missed the turn. We had to loop around."
    ]
  }
]);

const fragmentsErrors = err("fragments", [
  { text: "Because the ferry stopped running.", expect: ["fragment"], detectOnlyOk: true },
  { text: "Although everyone brought a dish.", expect: ["fragment"], detectOnlyOk: true },
  { text: "While waiting outside the clinic.", expect: ["fragment"], detectOnlyOk: true },
  { text: "Unless the package arrives before five.", expect: ["fragment"], detectOnlyOk: true },
  { text: "After driving through three counties.", expect: ["fragment"], detectOnlyOk: true },
  { text: "Even though the lights were flickering.", expect: ["fragment"], detectOnlyOk: true }
]);

const capProperMidErrors = err("cap-proper-mid", [
  { text: "We drove across ohio before noon.", expect: ["Ohio"] },
  { text: "The workshop resumes on wednesday morning.", expect: ["Wednesday"] },
  { text: "My cousin speaks fluent portuguese.", expect: ["Portuguese"] },
  { text: "They visited tokyo during cherry blossom season.", expect: ["Tokyo"] },
  { text: "Tuition bills are due in january.", expect: ["January"] },
  { text: "I met with elena beside the library.", expect: ["Elena"] }
]);

export const unseenCasesR2 = [].concat(
  casualLowercaseClean,
  notesListsClean,
  scriptureSermonClean,
  emailsTextsClean,
  questionsClean,
  namesCultureClean,
  timesUrlsCodeClean,
  britishSpellingsClean,
  trickyCleanProse,
  misspellingsErrors,
  agreementVariedErrors,
  pluralsErrors,
  tenseErrors,
  articlesErrors,
  homophonesErrors,
  contractionsErrors,
  alotErrors,
  couldOfErrors,
  doubleNegativesErrors,
  wrongWordFormsErrors,
  runonsCommaSplicesErrors,
  fragmentsErrors,
  capProperMidErrors
);

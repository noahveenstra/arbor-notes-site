// Fresh realistic sentences. expect [] must stay clean. A replacement string
// is the suggestion text. acceptableOutputs lists full sentences that also count.

function clean(category, items) {
  return items.map(function (item, index) {
    const text = typeof item === "string" ? item : item.text;
    const prot = typeof item === "string" ? [] : (item.protected || []);
    return { id: category + "-" + String(index + 1).padStart(2, "0"), category: category, text: text, expect: [], protected: prot };
  });
}

function err(category, items) {
  return items.map(function (item, index) {
    return {
      id: category + "-" + String(index + 1).padStart(2, "0"),
      category: category,
      text: item.text,
      expect: item.expect,
      protected: item.protected || [],
      acceptableOutputs: item.acceptableOutputs || null
    };
  });
}

const casualLowercaseClean = clean("casual-lowercase-clean", [
  "coffee tasted burnt today so i poured it out.",
  "stayed up reading until midnight.",
  "nothing felt urgent all morning.",
  "went back to the old draft and liked it better.",
  "maybe we wait until next week to decide.",
  "i tried calling twice before giving up.",
  "the porch light was still on when i got back.",
  "honestly i forgot what i came into the kitchen for.",
  "walks after dinner always help me clear my head.",
  "not sure whether to keep the second paragraph.",
  "i left the spare key under the clay pot.",
  "rained most of the afternoon so we stayed inside.",
  "glad we talked it through before the trip.",
  "the soup needed more salt than i thought.",
  "told myself i would finish this chapter tonight.",
  "quiet house for once, just the fridge humming.",
  "i still prefer the plain version over the new one."
]);

const casualLowercaseErrors = err("casual-lowercase-errors", [
  { text: "we cant make it before seven.", expect: ["can't"] },
  { text: "she dont seem worried about the deadline.", expect: ["doesn't"] },
  { text: "we saw three fox near the creek.", expect: ["foxes"] },
  { text: "they has two spare chairs in the garage.", expect: ["have"] },
  { text: "she recieved the package yesterday.", expect: ["received"] },
  { text: "their bringing the dessert tonight.", expect: ["they're"], acceptableOutputs: ["They're bringing the dessert tonight.", "they're bringing the dessert tonight."] },
  { text: "he always forget where he parked.", expect: ["forgets"] },
  { text: "we wasnt expecting anyone until noon.", expect: ["weren't"] },
  { text: "this is seperate from the main budget.", expect: ["separate"] },
  { text: "there are two bench behind the shed.", expect: ["benches"] },
  { text: "youre keys are still in the ignition.", expect: ["Your"], acceptableOutputs: ["Your keys are still in the ignition.", "your keys are still in the ignition."] },
  { text: "it doesnt look like rain anymore.", expect: ["doesn't"] },
  { text: "yeah i can bring extra chairs on sunday.", expect: ["Sunday"] }
]);

const notesClean = clean("notes-and-lists-clean", [
  "- milk and oat bread",
  { text: "- [ ] send updated schedule to Hannah", protected: ["Hannah"] },
  "Meeting notes: budget and timeline",
  "Prep for Sunday",
  "1. open with prayer",
  "2. read the passage aloud",
  "Parking: north lot behind the gym",
  "Remember: charger, passport, notebook",
  "Things to check before we leave",
  "- because the bridge was closed",
  "Quick summary of yesterday",
  "- pick up two bags of flour",
  "Call Mom back around four",
  "Groceries for the weekend"
]);

const notesErrors = err("notes-and-lists-errors", [
  { text: "- buy three bag of coffee", expect: ["bags"], acceptableOutputs: ["- buy three bags of coffee"] },
  { text: "- check if Sam have the receipt", expect: ["has"], protected: ["Sam"], acceptableOutputs: ["- check if Sam has the receipt"] },
  { text: "- we cant ship until Friday", expect: ["can't"], protected: ["Friday"], acceptableOutputs: ["- we can't ship until Friday"] },
  { text: "- replace the broken hinge tomorow", expect: ["tomorrow"], acceptableOutputs: ["- replace the broken hinge tomorrow"] },
  { text: "- call dentist about tuesday", expect: ["Tuesday"], acceptableOutputs: ["- call dentist about Tuesday"] }
]);

const scriptureClean = clean("scripture-and-sermon-clean", [
  { text: "Read Matt. 6:33 before opening the discussion.", protected: ["Matt. 6:33"] },
  { text: "In 1 Tim 4:12, Paul addresses Timothy's youth.", protected: ["1 Tim 4:12", "Paul", "Timothy's"] },
  { text: "Colossians 3:12–14 was the anchor for the whole talk.", protected: ["Colossians 3:12–14"] },
  { text: "Notice how Ps. 139:14 shifts from awe to gratitude.", protected: ["Ps. 139:14"] },
  "Grace does not erase grief; it sits inside it.",
  { text: "The Greek verb in Luke 10:38 implies ongoing hospitality.", protected: ["Greek", "Luke 10:38"] },
  { text: "Compare Gen. 12:1-3 with Galatians 3:8.", protected: ["Gen. 12:1-3", "Galatians 3:8"] },
  "Sermon title: Patience in the Ordinary",
  { text: "Keep 2 Pet 1:5 in the printed handout.", protected: ["2 Pet 1:5"] },
  { text: "The congregation read Psalm 121 responsively.", protected: ["Psalm 121"] },
  { text: "Deut. 6:4-9 sits behind the whole argument.", protected: ["Deut. 6:4-9"] },
  { text: "1 Kings 19:11-12 reminds us that God speaks in stillness.", protected: ["1 Kings 19:11-12", "God"] },
  "The choir sang the third verse a cappella.",
  "Lent begins earlier than usual this year."
]);

const scriptureErrors = err("scripture-and-sermon-errors", [
  { text: "Paul write in Romans 12:1 about living sacrifices.", expect: ["writes"], protected: ["Paul", "Romans 12:1"] },
  { text: "The sermon had two main point.", expect: ["points"] },
  { text: "We cant rush through Isaiah 53:1-6.", expect: ["can't"], protected: ["Isaiah 53:1-6"] },
  { text: "There are several passage in Hebrews worth marking.", expect: ["passages"], protected: ["Hebrews"] },
  { text: "The pastor dont usually use slides.", expect: ["doesn't"] }
]);

const emailsClean = clean("emails-clean", [
  { text: "Hi Marcus, thanks for sending the revised budget.", protected: ["Marcus"] },
  { text: "I'll be out of office Thursday afternoon through Friday.", protected: ["Thursday", "Friday"] },
  "Could you share the link before our three o'clock call?",
  "Attached is the invoice from last month.",
  { text: "Let me know if Tuesday morning still works for you.", protected: ["Tuesday"] },
  "Please keep the intro short so we have time for questions.",
  "No rush on this—whenever you have a quiet ten minutes.",
  { text: "I looped in Priya so she has the latest numbers.", protected: ["Priya"] },
  "Sorry for the delay; it has been a packed week.",
  { text: "Looking forward to catching up next Monday.", protected: ["Monday"] }
]);

const emailsErrors = err("emails-errors", [
  { text: "Please let me know if you have any question.", expect: ["questions"], acceptableOutputs: ["Please let me know if you have any questions.", "Please let me know if you have any question?"] },
  { text: "I have attached the seperate PDF for review.", expect: ["separate"], protected: ["PDF"] },
  { text: "Your welcome to join us at noon.", expect: ["You're"] },
  { text: "We has a few open slots on Wednesday.", expect: ["have"], protected: ["Wednesday"] },
  { text: "Its been great working with your team.", expect: ["It's"] },
  { text: "I will send the final version untill Friday.", expect: ["until"], protected: ["Friday"] },
  { text: "The document need one more pass.", expect: ["needs"] },
  { text: "We didnt get the confirmation email.", expect: ["didn't"] },
  { text: "Thanks for accomodating the schedule change.", expect: ["accommodating"] },
  { text: "There planning to announce it tomorrow.", expect: ["They're"] }
]);

const questionsClean = clean("questions-clean", [
  "Did anyone lock the back door?",
  "Which chapter are we covering tonight?",
  "When did she say the package would arrive?",
  "Who wants the last slice of pie?",
  { text: "Could we push the review to Thursday?", protected: ["Thursday"] },
  { text: "Have you heard back from Dr. Patel yet?", protected: ["Dr.", "Patel"] },
  "Why wasn't that included in the summary?",
  "Where did you put the spare keys?",
  "Is there enough coffee for everyone?",
  "What time does the service start?"
]);

const questionsErrors = err("questions-errors", [
  { text: "Does she likes the new layout?", expect: ["like"] },
  { text: "Did he went to the store already?", expect: ["go"] },
  { text: "How many chair do we need?", expect: ["chairs"] },
  { text: "Whose going to pick up the food?", expect: ["Who's"] },
  { text: "Wheres the other notebook?", expect: ["Where's"] }
]);

const namesProtectedClean = clean("names-and-protected-clean", [
  { text: "Met with Kofi and Ananya after lunch.", protected: ["Kofi", "Ananya"] },
  { text: "Send the receipt to billing@usearbor.app today.", protected: ["billing@usearbor.app"] },
  { text: "Check https://notes.usearbor.app for the latest build.", protected: ["https://notes.usearbor.app"] },
  { text: "Ask @tunde about the #onboarding copy.", protected: ["@tunde", "#onboarding"] },
  { text: "Run `npm run test:web` before pushing.", protected: ["`npm run test:web`"] },
  { text: "We stayed with the Hendricksons in Grand Rapids.", protected: ["Hendricksons", "Grand", "Rapids"] },
  { text: "Nadia and Mateo brought sourdough.", protected: ["Nadia", "Mateo"] },
  { text: "Remember to include O'Connor on the invite.", protected: ["O'Connor"] },
  { text: "The ARB-203 ticket tracks this fix.", protected: ["ARB-203"] },
  { text: "Do not edit `config.json` by hand.", protected: ["`config.json`"] }
]);

const namesProtectedErrors = err("names-and-protected-errors", [
  { text: "Kofi and Ananya is bringing dessert.", expect: ["are"], protected: ["Kofi", "Ananya"] },
  { text: "Check https://notes.usearbor.app because its updated.", expect: ["it's"], protected: ["https://notes.usearbor.app"], acceptableOutputs: ["Check https://notes.usearbor.app because it's updated.", "Check https://notes.usearbor.app because it is updated."] },
  { text: "Send @tunde two copy of the flyer.", expect: ["copies"], protected: ["@tunde"] },
  { text: "Mateo have the spare key.", expect: ["has"], protected: ["Mateo"] },
  { text: "I emailed Noah yesterday but he didnt reply.", expect: ["didn't"], protected: ["Noah"] }
]);

const invariantVerbsClean = clean("invariant-verbs-clean", [
  "Yesterday he read three chapters before bed.",
  "She put the groceries away and sat down.",
  "They set the chairs in a circle.",
  "He cut the rope in half.",
  "She let the dog out at dawn."
]);

const invariantVerbsErrors = err("invariant-verbs-errors", [
  { text: "Every morning she read the paper with coffee.", expect: ["reads"] },
  { text: "He always put too much salt in the soup.", expect: ["puts"] },
  { text: "She usually set her alarm for six.", expect: ["sets"] },
  { text: "That knife cut through bread easily.", expect: ["cuts"] },
  { text: "He never let anyone help him.", expect: ["lets"] }
]);

const massNounsClean = clean("mass-nouns-clean", [
  "We have plenty of information for now.",
  "The furniture in the lobby looks new.",
  "Her advice was surprisingly practical.",
  "Much research remains to be done.",
  "The luggage is already in the trunk."
]);

const massNounsErrors = err("mass-nouns-errors", [
  { text: "There are many information in that folder.", expect: ["much"], acceptableOutputs: ["There is much information in that folder.", "There is a lot of information in that folder.", "There are lots of information in that folder.", "There is lots of information in that folder."] },
  { text: "We bought several furnitures for the office.", expect: ["furniture"], acceptableOutputs: ["We bought several pieces of furniture for the office.", "We bought some furniture for the office.", "We bought furniture for the office."] },
  { text: "She gave me two advices before I left.", expect: ["advice"], acceptableOutputs: ["She gave me two pieces of advice before I left.", "She gave me some advice before I left.", "She gave me advice before I left."] },
  { text: "I have many homework tonight.", expect: ["much"], acceptableOutputs: ["I have much homework tonight.", "I have a lot of homework tonight.", "I have lots of homework tonight."] },
  { text: "He brought three luggages on the flight.", expect: ["luggage"], acceptableOutputs: ["He brought three pieces of luggage on the flight.", "He brought three bags of luggage on the flight.", "He brought luggage on the flight."] }
]);

const collectiveNounsClean = clean("collective-nouns-clean", [
  "The team is meeting at ten.",
  "The family are arriving from three different states.",
  "The committee has reached a decision.",
  "Our staff is small but dedicated."
]);

const collectiveNounsErrors = err("collective-nouns-errors", [
  { text: "The teams is ready for the game.", expect: ["are"] },
  { text: "Two team are playing tonight.", expect: ["teams"] },
  { text: "Several family lives on this block.", expect: ["families", "live"], acceptableOutputs: ["Several families live on this block."] },
  { text: "Our committees has met twice.", expect: ["have"] }
]);

const homophonesClean = clean("homophones-clean", [
  "We will wait until then.",
  "Its fur was wet from the rain.",
  "Their house is at the end of the lane.",
  "There are three mugs in the sink.",
  "Your coat is on the hook."
]);

const homophonesErrors = err("homophones-errors", [
  { text: "This coffee is stronger then the last batch.", expect: ["than"] },
  { text: "The weather will effect our travel plans.", expect: ["affect"] },
  { text: "Don't loose your boarding pass.", expect: ["lose"] },
  { text: "I want to go too the market.", expect: ["to"] },
  { text: "She knows alot about gardening.", expect: ["a lot"] },
  { text: "They're dog barked all night.", expect: ["Their"] },
  { text: "You're keys are on the counter.", expect: ["Your"] },
  { text: "The cat licked it's paw.", expect: ["its"] },
  { text: "We walked passed the old bakery.", expect: ["past"] },
  { text: "I could of sworn I locked the gate.", expect: ["have"], acceptableOutputs: ["I could have sworn I locked the gate."] }
]);

const edgeAndGapsClean = clean("edge-clean", [
  "If you are ever in town, stop by.",
  "Although exhausted, he finished the chapter.",
  "When the bell rang everyone stood up.",
  { text: "Since last Tuesday we have heard nothing.", protected: ["Tuesday"] },
  "That he arrive on time is essential.",
  "The doctor recommended that she rest.",
  "Neither option sounds ideal."
]);

const edgeAndGapsErrors = err("edge-errors", [
  { text: "We bought two bench for the porch.", expect: ["benches"] },
  { text: "The meeting had four speaker.", expect: ["speakers"] },
  { text: "My neighbor walk three miles every day.", expect: ["walks"] },
  { text: "The kids plays outside until dark.", expect: ["play"] },
  { text: "Yesterday I go to the store and bought milk.", expect: ["went"] },
  { text: "Because nobody wanted to leave early.", expect: ["fragment"] },
  { text: "Although the weather finally cleared up.", expect: ["fragment"] },
  { text: "She was suppose to call at noon.", expect: ["supposed"], acceptableOutputs: ["She was supposed to call at noon."] },
  { text: "I am use to waking up early.", expect: ["used"], acceptableOutputs: ["I am used to waking up early."] }
]);

const freshCases = [].concat(
  casualLowercaseClean,
  casualLowercaseErrors,
  notesClean,
  notesErrors,
  scriptureClean,
  scriptureErrors,
  emailsClean,
  emailsErrors,
  questionsClean,
  questionsErrors,
  namesProtectedClean,
  namesProtectedErrors,
  invariantVerbsClean,
  invariantVerbsErrors,
  massNounsClean,
  massNounsErrors,
  collectiveNounsClean,
  collectiveNounsErrors,
  homophonesClean,
  homophonesErrors,
  edgeAndGapsClean,
  edgeAndGapsErrors
);

export { freshCases };

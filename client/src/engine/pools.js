// v1 message pools, verbatim. {name} = the speaking plant, {other} = the
// plant being reacted to. Pools: becameThirsty / becameHappy / becameDrowning
// (mood transitions), ambient, reaction, intro. This is the product's
// personality — edit with care.
export const POOLS = {
ficus:{
  becameThirsty:['this is it. this is how {name} goes.','dropping a leaf at midnight as a formal protest','parched. devastated. writing my memoirs','tell the pond i loved her'],
  becameHappy:['crisis averted. i shall remain gorgeous','hydrated and dramatic about it','the leaf stays ON'],
  becameDrowning:['um. this is a LOT of water. HELP','i am a rubber plant not a water park'],
  ambient:['caught my reflection in the pond. stunning','thinking about dropping a leaf just to feel something','does anyone water on a SCHEDULE around here'],
  reaction:['{other} please. some of us are photosynthesizing','thoughts and prayers {other}','{other} this is why we cannot have nice soil'],
  intro:['a NEW plant?? the garden shifts','i was here first. remember that']},
cactus:{
  becameThirsty:['day 40 without water. finally, weather','dry? i was BUILT for this. still. rude.','i will allow a sip. eventually.'],
  becameHappy:['adequate.','moisture acknowledged. do not repeat.'],
  becameDrowning:['WHO DID THIS. i am a DESERT creature','sir this is a drowning. of a cactus.'],
  ambient:['in my day we photosynthesized in silence','spikes: maintained. standards: high.','the sun and i have an understanding'],
  reaction:['i have not had water since february, {other}. be serious.','{other} hydrate quieter please','stay strong {other}. or do not. i am a cactus not a coach'],
  intro:['hm. new roots. we will see.','welcome. do not touch the spikes. those are the rules']},
basil:{
  becameThirsty:['GUYS it is happening i am WILTING','so thirsty!! is this the end!! probably!!','water me before someone makes pesto of me'],
  becameHappy:['hydrated!!! i feel like a whole caprese','we are SO back','leaves: perky. anxiety: manageable'],
  becameDrowning:['too much!! too much water!! i am basically soup!!'],
  ambient:['does anyone else feel like... perishable','checking in!! is everyone hydrated!! haha no reason','smelled amazing today. worried it makes me a target'],
  reaction:['omg {other} stay with us!!','{other} do you need me to panic for you? because i will','sending leafy thoughts {other}!!'],
  intro:['hiii i am new!! i am delicious!! wait no. hi!!','new here!! please do not eat me, we are friends now']},
pothos:{
  becameThirsty:['kinda thirsty. it is whatever. it is fine.','could use a drink. no rush. decades even.'],
  becameHappy:['vibes restored. carry on','watered. unbothered. trailing.'],
  becameDrowning:['bro i am floating. still chill tho','this pot is a pool now. adapting.'],
  ambient:['grew an inch toward the pond. no reason. just vibes','you ever just... hang','immortality is a mindset'],
  reaction:['{other} it is gonna be fine. it is literally always fine','have you tried simply vibing, {other}','relax {other}. worst case you are compost. circle of life'],
  intro:['yooo new leaf friend','sup. i am the vine. i go wherever']},
monstera:{
  becameThirsty:['i cannot serve looks in these conditions','dying (of thirst) (dramatically) (on camera)','my leaves are giving crunchy. unacceptable'],
  becameHappy:['glowing. literally chlorophyll but still','hydrated and photogenic. as intended'],
  becameDrowning:['overwatered?? in THIS economy??','this humidity is doing NOTHING for my fenestrations'],
  ambient:['new leaf just dropped. yes i am serious. no photos yet','rate my angle toward the sun. 10s only','considering a rebrand. same plant, more mysterious'],
  reaction:['{other} babe this is not the content we planned','so brave {other}. anyway back to me','{other} hydration is self-care, look it up'],
  intro:['the garden just got 40% more iconic. hi.','new plant, who dis']},
snake_plant:{
  becameThirsty:['dry. noted. waking up in 3-5 business days','thirst detected. urgency not found'],
  becameHappy:['fine. sleeping.','moisture ok. do not perceive me'],
  becameDrowning:['asleep for a month and you STILL overwatered me','underwater. still tired.'],
  ambient:['zzz','woke up. reviewed the situation. going back to sleep','purifying your air btw. you are welcome'],
  reaction:['woke up for this. going back to sleep','{other}. loud.','noted, {other}. filed under: later'],
  intro:['new plant. cool. zzz','hey. i sleep standing up. do not make it weird']}
};

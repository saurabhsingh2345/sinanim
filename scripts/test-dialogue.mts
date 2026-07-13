import { sentencesWithSpeaker, stripSpeakers, contrastVoice, hasDialogue } from '../lib/narration';
const text = "So what happens if the key is missing? [student] Wait, wouldn't that crash? [teacher] Good instinct, but it returns None instead.";
console.log('hasDialogue:', hasDialogue(text));
console.log('contrastVoice(af_heart):', contrastVoice('af_heart'));
console.log('contrastVoice(am_michael):', contrastVoice('am_michael'));
console.log('stripped:', JSON.stringify(stripSpeakers(text)));
console.log('segments:');
for (const s of sentencesWithSpeaker(text)) console.log(`  [${s.speaker}] ${s.text}`);
// no-marker regression: everything teacher
const plain = "First sentence. Second sentence.";
console.log('plain segments:', sentencesWithSpeaker(plain).map(s => s.speaker).join(','));

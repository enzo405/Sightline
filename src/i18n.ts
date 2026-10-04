// Lightweight i18n: EN/FR language switch, persisted in localStorage.
// All user-facing strings live in the DICT below; features call t('key').
// Note/key names are language-aware (English letters vs. French solfège).

import { keyNameFr, midiToName, midiToNameFr } from './theory';

export type Lang = 'en' | 'fr';

const STORE_KEY = 'sightline.lang';

function detectDefault(): Lang {
  const saved = localStorage.getItem(STORE_KEY);
  if (saved === 'en' || saved === 'fr') return saved;
  return navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

let current: Lang = detectDefault();
const listeners = new Set<(l: Lang) => void>();

export function lang(): Lang {
  return current;
}

export function setLang(l: Lang): void {
  if (l === current) return;
  current = l;
  localStorage.setItem(STORE_KEY, l);
  document.documentElement.lang = l;
  for (const fn of [...listeners]) fn(l);
}

export function onLangChange(fn: (l: Lang) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Language-aware note name (English letters or French solfège). */
export function noteName(midi: number, preferFlats = false): string {
  return current === 'fr' ? midiToNameFr(midi, preferFlats) : midiToName(midi, preferFlats);
}

/** Language-aware tonic name for a key signature, e.g. "Bb" / "Si♭". */
export function keyName(key: string): string {
  return current === 'fr' ? keyNameFr(key) : key;
}

type Dict = Record<string, string>;

const EN: Dict = {
  'lang.toggle': 'FR',
  'lang.toggleTitle': 'Passer en français',

  'tab.mirror': '1 · Mirror',
  'tab.read': '2 · Sight-Reading',
  'tab.fading': '3 · Fading Score',
  'tab.improv': '4 · Improv Lab',
  'tab.technique': '5 · Technique',
  'tab.progress': 'Progress',
  'tab.settings': '⚙ Settings',

  'midi.loading': 'MIDI: …',
  'midi.ready': 'MIDI: {devices}',
  'midi.none': 'MIDI: no device — use on-screen keys or A–; row',
  'midi.denied': 'MIDI: permission denied',
  'midi.unsupported': 'MIDI: not available — on-screen keys and the A–; row still work',
  'midi.enable': '🎹 Enable MIDI',
  'midi.enableTitle': 'Connect your MIDI keyboard (asks for browser permission)',
  'midi.retry': '↻ Retry MIDI',

  // Mirror
  'mirror.title': 'Play-to-Notation Mirror',
  'mirror.intro': 'Play something you already know — from your MIDI piano, the on-screen keys, or your computer keyboard (<code>A</code>–<code>;</code> row = C4–E5). Hit <b>Stop</b> and see it written out. The rhythm grid locks onto your <em>first note</em>, so start cleanly; the metronome helps you stay on it.',
  'mirror.tempo': 'Tempo',
  'mirror.bpm': 'BPM',
  'mirror.grid': 'Grid',
  'mirror.grid8': 'Eighth notes',
  'mirror.grid16': 'Sixteenth notes',
  'mirror.metronome': 'Metronome while recording',
  'mirror.record': '● Record',
  'mirror.stop': '■ Stop',
  'mirror.play': '▶ Play back',
  'mirror.stopPlay': '■ Stop playback',
  'mirror.ready': 'Ready — press Record, then play.',
  'mirror.placeholder': 'Your notation will appear here.',
  'mirror.recording': 'Recording… {n} {noteWord}',
  'mirror.recordingStart': 'Recording… play your piece.',
  'mirror.nothing': 'Nothing recorded — press Record and play some notes.',
  'mirror.captured': 'Captured {n} notes across {bars} {barWord}. This is what you played.',
  'mirror.note': 'note',
  'mirror.notes': 'notes',
  'mirror.bar': 'bar',
  'mirror.bars': 'bars',

  // Sight-reading
  'read.title': 'Adaptive Sight-Reading',
  'read.intro': 'Play the highlighted note (blue) at your own steady pulse. Correct notes turn <span class="tag-green">green</span>, misses flash <span class="tag-red">red</span> — the exercise targets ~85% accuracy: score above 92% and you level up, below 75% and it eases off. Rhythm is judged against your own tempo after you finish.',
  'read.level': 'Level',
  'read.key': 'Key: {key} major',
  'read.clef': 'Clef',
  'read.treble': 'Treble',
  'read.bass': 'Bass',
  'read.new': 'New exercise',
  'read.noteCount': 'Note {n}/{total}',
  'read.noteCountMiss': 'Note {n}/{total} · {m} {missWord}',
  'read.miss': 'miss',
  'read.misses': 'misses',
  'read.done': 'Done!',
  'read.levelUp': '⬆ Level up! Now level {level}.',
  'read.levelDown': '⬇ Easing off — level {level}.',
  'read.levelHold': 'Holding level — right in the challenge zone.',
  'read.accLabel': 'pitch accuracy ({correct}/{total} first try)',
  'read.npmLabel': 'notes per minute',
  'read.rhythmLabel': 'rhythm flags (rushed/held, vs your own pulse)',
  'read.next': 'Next exercise →',
  'flag.rushed': 'rushed',
  'flag.held': 'held',

  // Fading
  'fade.title': 'Fading Score',
  'fade.intro': 'Pick a piece you know by ear. Level 1 shows every hint; each pass at <b>≥90% accuracy</b> fades one layer — first note names, then fingering, then whole bars go blank (play them from memory: the notes reappear as you get them right). This trains reading ahead and playing through instead of stopping at every bar.',
  'fade.piece': 'Piece',
  'fade.stage': 'Stage',
  'fade.restart': 'Restart piece',
  'fade.again': 'Play again →',
  'fade.level1': 'Full hints — note names + fingering',
  'fade.level2': 'Fingering only — note names are gone',
  'fade.level3': 'Notation only — no hints left',
  'fade.level4': 'Reading ahead — every 4th bar is blank',
  'fade.level5': 'From memory — every other bar is blank',
  'fade.faded': '🎉 {pct}% — layer faded! Next: <b>{next}</b>',
  'fade.mastered': '🏆 {pct}% — you own this piece from memory. Mastered!',
  'fade.retry': '{pct}% — you need ≥90% to fade the next layer. Run it again.',

  // Improv
  'improv.title': 'Improvisation Lab',
  'improv.intro': 'Start the backing track and improvise over the changes. On the keyboard below, <span class="tag-chord">chord tones</span> and <span class="tag-scale">scale tones</span> light up for the current chord. Pick a constraint card to force real choices, or run a call-and-response drill: listen, then echo.',
  'improv.progression': 'Progression',
  'improv.tempo': 'Tempo',
  'improv.bpm': 'BPM',
  'improv.start': '▶ Start backing',
  'improv.stop': '■ Stop backing',
  'improv.constraintCard': 'Constraint card',
  'improv.kept': 'constraint kept',
  'improv.chordTones': 'chord tones',
  'improv.notesPlayed': 'notes played',
  'improv.reset': 'Reset stats',
  'improv.callResponse': 'Call &amp; response',
  'improv.callResponseIntro': "Sightline plays a short phrase from the current chord's scale — echo it back (any octave). Five rounds.",
  'improv.startDrill': 'Start drill',
  'improv.stopDrill': '■ Stop drill',
  'improv.paletteLabel': 'Your palette: {notes}',
  'improv.palettePrompt': 'Play your first three notes to set the palette.',
  'improv.window': 'Window: {low} – {high}',
  'improv.drillListen': 'Round {n}/5 — listen…',
  'improv.drillTurn': 'Round {n}/5 — your turn! Echo {len} notes (any octave).',
  'improv.drillDone': 'Drill done: {score}/5 phrases echoed correctly.',
  'improv.drillRow': 'heard <b>{expected}</b>, you played <b>{got}</b>',

  'prog.blues-c': '12-Bar Blues in C',
  'prog.pop-c': 'Pop I–V–vi–IV in C',
  'prog.251-f': 'Jazz ii–V–I in F',
  'prog.vamp-am': 'Minor vamp in A minor',

  'constraint.free': 'Free play',
  'constraint.free.desc': 'No constraint — just watch the chord-tone lights and stats.',
  'constraint.chord-tones': 'Only chord tones',
  'constraint.chord-tones.desc': 'Every note must belong to the current chord. Arpeggios are your friend.',
  'constraint.scale': 'Stay in the scale',
  'constraint.scale.desc': 'Any note from the scale of the current chord counts.',
  'constraint.three-notes': 'Only 3 notes',
  'constraint.three-notes.desc': 'Your first three distinct notes become your entire palette. Make them sing.',
  'constraint.one-octave': 'One octave',
  'constraint.one-octave.desc': 'Your first note pins a one-octave window. Stay inside it.',

  // Pieces
  'piece.ode-to-joy': 'Ode to Joy (Beethoven)',
  'piece.twinkle': 'Twinkle, Twinkle, Little Star',
  'piece.saints': 'When the Saints Go Marching In',
  'piece.jingle-bells': 'Jingle Bells (chorus)',

  // Technique
  'tech.title': 'Technique Trainer',
  'tech.intro': 'Build finger technique: play the drill up and then down at a steady pulse, using the <b>printed fingering</b>. Correct notes turn green; you are graded on accuracy and <em>evenness</em>, and your top <b>clean</b> tempo is saved per drill. Start slow and even, then push the tempo.',
  'tech.type': 'Drill',
  'tech.root': 'Key',
  'tech.hand': 'Hand',
  'tech.fiveMajor': 'Five-finger (major)',
  'tech.fiveMinor': 'Five-finger (minor)',
  'tech.scaleMajor': 'Major scale (1 octave)',
  'tech.arpeggio': 'Major arpeggio (1 octave)',
  'tech.right': 'Right hand',
  'tech.left': 'Left hand',
  'tech.new': 'Restart',
  'tech.best': 'Top clean: {npm} n/min',
  'tech.noBest': 'No clean run yet',
  'tech.accLabel': 'notes correct first try',
  'tech.npmLabel': 'notes per minute',
  'tech.evenLabel': 'evenness (timing consistency)',
  'tech.clean': 'Clean run — keep pushing the tempo for a new top speed.',
  'tech.newBest': '🏆 Clean run & new top speed: {npm} notes/min!',
  'tech.notClean': '{pct}% — aim for ≥95% clean before chasing speed.',
  'tech.again': 'Again →',

  // Settings
  'settings.title': 'Settings',
  'settings.intro': 'Everything is saved on this device — no account needed.',
  'settings.audio': 'Audio',
  'settings.pianoSound': 'Play piano sound',
  'settings.pianoSoundHint': 'Turn this off if you hear your own piano directly and only want the app for visuals.',
  'settings.volume': 'Volume',
  'settings.tone': 'Piano tone',
  'settings.toneHint': 'The timbre of the app’s piano sound.',
  'settings.toneGrand': 'Grand',
  'settings.toneDark': 'Dark',
  'settings.toneLofi': 'Lo-fi',
  'settings.language': 'Language',
  'settings.midi': 'MIDI keyboard',
  'settings.on': 'On',
  'settings.off': 'Off',
  'settings.data': 'Your data',
  'settings.dataHint': 'All practice history and settings live only in this browser. Nothing is sent anywhere.',
  'settings.reset': 'Reset all my data',
  'settings.resetConfirm': 'Erase all practice history, progress and settings on this device? This cannot be undone.',

  // Tutorials (steps separated by |)
  'tut.title': 'How it works',
  'tut.mirror': 'Pick an input: MIDI piano, the on-screen keys, or your A–; computer-keyboard row.|Press Record, wait for the count-in, then play a short phrase you know.|Start on the beat — the rhythm grid locks onto your first note.|Press Stop to see your playing written as notation, then refine and repeat.',
  'tut.read': 'A single note is highlighted in blue — play it on your instrument.|Keep a steady pulse; correct notes turn green, misses flash red.|Play the whole line through without stopping; rhythm is scored afterwards.|Stay above 92% to level up — difficulty adapts to keep you near 85%.',
  'tut.fading': 'Choose a piece you already know by ear.|Play it through with every hint shown (note names, fingering, full bars).|Score ≥90% and the next layer of hints fades away.|Keep going until the bars are blank and you are playing from memory.',
  'tut.improv': 'Press Start to launch the backing track over a chord progression.|Watch the keyboard: chord tones and scale tones light up for the current chord.|Improvise using the lit notes; add a constraint card to push your choices.|Or run call-and-response: listen to a phrase, then echo it back.',
  'tut.technique': 'Choose a drill type, a key, and which hand to train.|Play the pattern up and then back down, following the printed fingering.|Keep an even pulse — you are graded on accuracy and evenness.|Play it cleanly, then raise the tempo; your best clean speed is saved.',
  'tut.progress': 'Everything here is measured from your real playing — nothing is self-reported.|Practice a little every day to grow your streak.|Read the accuracy trend and per-key bars to find weak spots.|Hover any chart point for the exact numbers.',
  'tut.settings': 'Turn the app piano sound off if you only want visuals while hearing your own piano.|Pick a piano tone and set the volume to taste.|Connect a MIDI keyboard, or switch the language.|Use “Reset all my data” to wipe your history and start fresh.',

  // Progress
  'progress.title': 'Your skill map',
  'progress.intro': 'Short daily sessions, visible progress. Everything below is measured from your actual playing in the other three rooms — nothing is self-reported.',
  'progress.level': 'sight-reading level',
  'progress.accuracy': 'accuracy, last 10 exercises',
  'progress.bestSpeed': 'best reading speed (notes/min)',
  'progress.streak': 'day streak',
  'progress.notesPlayed': 'notes played in Sightline',
  'progress.trendTitle': 'Sight-reading accuracy trend',
  'progress.keysTitle': 'Accuracy by key signature',
  'progress.fadingTitle': 'Fading Score stages',
  'progress.improvTitle': 'Improvisation',
  'progress.techniqueTitle': 'Technique — top clean tempo',
  'progress.techniqueEmpty': 'Play a clean technique drill (≥95%) and your top tempos appear here.',
  'progress.techNpm': '{npm} n/min',
  'progress.trendEmpty': 'Complete a couple of sight-reading exercises and your trend appears here.',
  'progress.keysEmpty': 'No key data yet — the sight-reading room fills this in.',
  'progress.keyTooltip': '{key} major · {total} notes',
  'progress.trendLabel': 'L{level} · {key} major · {date}',
  'progress.viewTable': 'View as table',
  'progress.colDate': 'Date',
  'progress.colLevel': 'Level',
  'progress.colKey': 'Key',
  'progress.colAccuracy': 'Accuracy',
  'progress.colNpm': 'Notes/min',
  'progress.keyMajor': '{key} major',
  'progress.notStarted': 'not started',
  'progress.run': '{n} run',
  'progress.runs': '{n} runs',
  'progress.chordTonesLast': 'chord tones, last session{prog}',
  'progress.bestCall': 'best call &amp; response',
  'progress.improvSessions': 'improv sessions',
};

const FR: Dict = {
  'lang.toggle': 'EN',
  'lang.toggleTitle': 'Switch to English',

  'tab.mirror': '1 · Miroir',
  'tab.read': '2 · Déchiffrage',
  'tab.fading': '3 · Partition qui s’efface',
  'tab.improv': '4 · Labo d’impro',
  'tab.technique': '5 · Technique',
  'tab.progress': 'Progression',
  'tab.settings': '⚙ Réglages',

  'midi.loading': 'MIDI : …',
  'midi.ready': 'MIDI : {devices}',
  'midi.none': 'MIDI : aucun appareil — utilisez le clavier à l’écran ou la rangée A–;',
  'midi.denied': 'MIDI : permission refusée',
  'midi.unsupported': 'MIDI : non disponible — le clavier à l’écran et la rangée A–; fonctionnent',
  'midi.enable': '🎹 Activer le MIDI',
  'midi.enableTitle': 'Connectez votre clavier MIDI (demande l’autorisation du navigateur)',
  'midi.retry': '↻ Réessayer le MIDI',

  // Miroir
  'mirror.title': 'Miroir jeu-partition',
  'mirror.intro': 'Jouez un morceau que vous connaissez déjà — depuis votre piano MIDI, le clavier à l’écran ou le clavier de l’ordinateur (rangée <code>A</code>–<code>;</code> = Do4–Mi5). Appuyez sur <b>Stop</b> et voyez-le écrit. La grille rythmique se cale sur votre <em>première note</em>, alors démarrez proprement ; le métronome vous aide à rester en place.',
  'mirror.tempo': 'Tempo',
  'mirror.bpm': 'BPM',
  'mirror.grid': 'Grille',
  'mirror.grid8': 'Croches',
  'mirror.grid16': 'Doubles croches',
  'mirror.metronome': 'Métronome pendant l’enregistrement',
  'mirror.record': '● Enregistrer',
  'mirror.stop': '■ Stop',
  'mirror.play': '▶ Réécouter',
  'mirror.stopPlay': '■ Arrêter la lecture',
  'mirror.ready': 'Prêt — appuyez sur Enregistrer, puis jouez.',
  'mirror.placeholder': 'Votre partition apparaîtra ici.',
  'mirror.recording': 'Enregistrement… {n} {noteWord}',
  'mirror.recordingStart': 'Enregistrement… jouez votre morceau.',
  'mirror.nothing': 'Rien d’enregistré — appuyez sur Enregistrer et jouez quelques notes.',
  'mirror.captured': '{n} notes capturées sur {bars} {barWord}. Voici ce que vous avez joué.',
  'mirror.note': 'note',
  'mirror.notes': 'notes',
  'mirror.bar': 'mesure',
  'mirror.bars': 'mesures',

  // Déchiffrage
  'read.title': 'Déchiffrage adaptatif',
  'read.intro': 'Jouez la note surlignée (bleu) à votre propre pulsation régulière. Les notes justes passent au <span class="tag-green">vert</span>, les erreurs clignotent en <span class="tag-red">rouge</span> — l’exercice vise ~85 % de précision : au-dessus de 92 %, vous montez de niveau ; en dessous de 75 %, il s’allège. Le rythme est évalué par rapport à votre propre tempo une fois terminé.',
  'read.level': 'Niveau',
  'read.key': 'Tonalité : {key} majeur',
  'read.clef': 'Clé',
  'read.treble': 'Sol',
  'read.bass': 'Fa',
  'read.new': 'Nouvel exercice',
  'read.noteCount': 'Note {n}/{total}',
  'read.noteCountMiss': 'Note {n}/{total} · {m} {missWord}',
  'read.miss': 'erreur',
  'read.misses': 'erreurs',
  'read.done': 'Terminé !',
  'read.levelUp': '⬆ Niveau supérieur ! Niveau {level} maintenant.',
  'read.levelDown': '⬇ On allège — niveau {level}.',
  'read.levelHold': 'Niveau maintenu — pile dans la zone de défi.',
  'read.accLabel': 'précision des hauteurs ({correct}/{total} du premier coup)',
  'read.npmLabel': 'notes par minute',
  'read.rhythmLabel': 'alertes rythme (précipité/tenu, vs votre pulsation)',
  'read.next': 'Exercice suivant →',
  'flag.rushed': 'précipité',
  'flag.held': 'tenu',

  // Partition qui s’efface
  'fade.title': 'Partition qui s’efface',
  'fade.intro': 'Choisissez un morceau que vous connaissez d’oreille. Le niveau 1 montre tous les indices ; chaque passage à <b>≥90 % de précision</b> efface une couche — d’abord les noms de notes, puis les doigtés, puis des mesures entières deviennent vides (jouez-les de mémoire : les notes réapparaissent quand vous les réussissez). Cela entraîne la lecture en avance et le jeu continu plutôt que l’arrêt à chaque mesure.',
  'fade.piece': 'Morceau',
  'fade.stage': 'Étape',
  'fade.restart': 'Recommencer le morceau',
  'fade.again': 'Rejouer →',
  'fade.level1': 'Tous les indices — noms de notes + doigtés',
  'fade.level2': 'Doigtés seuls — les noms de notes ont disparu',
  'fade.level3': 'Partition seule — plus aucun indice',
  'fade.level4': 'Lecture en avance — une mesure sur 4 est vide',
  'fade.level5': 'De mémoire — une mesure sur deux est vide',
  'fade.faded': '🎉 {pct} % — couche effacée ! Ensuite : <b>{next}</b>',
  'fade.mastered': '🏆 {pct} % — vous maîtrisez ce morceau de mémoire. Maîtrisé !',
  'fade.retry': '{pct} % — il faut ≥90 % pour effacer la couche suivante. Recommencez.',

  // Labo d’impro
  'improv.title': 'Labo d’improvisation',
  'improv.intro': 'Lancez l’accompagnement et improvisez sur la grille. Sur le clavier ci-dessous, les <span class="tag-chord">notes de l’accord</span> et les <span class="tag-scale">notes de la gamme</span> s’allument pour l’accord en cours. Choisissez une carte contrainte pour forcer de vrais choix, ou lancez un exercice d’appel-réponse : écoutez, puis répétez.',
  'improv.progression': 'Grille',
  'improv.tempo': 'Tempo',
  'improv.bpm': 'BPM',
  'improv.start': '▶ Démarrer l’accompagnement',
  'improv.stop': '■ Arrêter l’accompagnement',
  'improv.constraintCard': 'Carte contrainte',
  'improv.kept': 'contrainte respectée',
  'improv.chordTones': 'notes de l’accord',
  'improv.notesPlayed': 'notes jouées',
  'improv.reset': 'Réinitialiser les stats',
  'improv.callResponse': 'Appel &amp; réponse',
  'improv.callResponseIntro': 'Sightline joue une courte phrase dans la gamme de l’accord en cours — répétez-la (n’importe quelle octave). Cinq tours.',
  'improv.startDrill': 'Démarrer l’exercice',
  'improv.stopDrill': '■ Arrêter l’exercice',
  'improv.paletteLabel': 'Votre palette : {notes}',
  'improv.palettePrompt': 'Jouez vos trois premières notes pour fixer la palette.',
  'improv.window': 'Fenêtre : {low} – {high}',
  'improv.drillListen': 'Tour {n}/5 — écoutez…',
  'improv.drillTurn': 'Tour {n}/5 — à vous ! Répétez {len} notes (n’importe quelle octave).',
  'improv.drillDone': 'Exercice terminé : {score}/5 phrases répétées correctement.',
  'improv.drillRow': 'entendu <b>{expected}</b>, vous avez joué <b>{got}</b>',

  'prog.blues-c': 'Blues de 12 mesures en Do',
  'prog.pop-c': 'Pop I–V–vi–IV en Do',
  'prog.251-f': 'Jazz ii–V–I en Fa',
  'prog.vamp-am': 'Vamp mineur en La mineur',

  'constraint.free': 'Jeu libre',
  'constraint.free.desc': 'Aucune contrainte — surveillez simplement les notes allumées et les stats.',
  'constraint.chord-tones': 'Notes de l’accord seulement',
  'constraint.chord-tones.desc': 'Chaque note doit appartenir à l’accord en cours. Les arpèges sont vos amis.',
  'constraint.scale': 'Rester dans la gamme',
  'constraint.scale.desc': 'Toute note de la gamme de l’accord en cours compte.',
  'constraint.three-notes': '3 notes seulement',
  'constraint.three-notes.desc': 'Vos trois premières notes distinctes deviennent toute votre palette. Faites-les chanter.',
  'constraint.one-octave': 'Une octave',
  'constraint.one-octave.desc': 'Votre première note fixe une fenêtre d’une octave. Restez dedans.',

  // Morceaux
  'piece.ode-to-joy': 'Hymne à la joie (Beethoven)',
  'piece.twinkle': 'Ah ! vous dirai-je, maman',
  'piece.saints': 'When the Saints Go Marching In',
  'piece.jingle-bells': 'Vive le vent (refrain)',

  // Technique
  'tech.title': 'Entraînement technique',
  'tech.intro': 'Développez la technique des doigts : jouez l’exercice en montant puis en descendant à une pulsation régulière, en respectant le <b>doigté indiqué</b>. Les notes justes passent au vert ; vous êtes évalué sur la précision et la <em>régularité</em>, et votre meilleur tempo <b>propre</b> est enregistré par exercice. Commencez lentement et régulièrement, puis accélérez.',
  'tech.type': 'Exercice',
  'tech.root': 'Tonalité',
  'tech.hand': 'Main',
  'tech.fiveMajor': '5 doigts (majeur)',
  'tech.fiveMinor': '5 doigts (mineur)',
  'tech.scaleMajor': 'Gamme majeure (1 octave)',
  'tech.arpeggio': 'Arpège majeur (1 octave)',
  'tech.right': 'Main droite',
  'tech.left': 'Main gauche',
  'tech.new': 'Recommencer',
  'tech.best': 'Record propre : {npm} n/min',
  'tech.noBest': 'Pas encore de passage propre',
  'tech.accLabel': 'notes justes du premier coup',
  'tech.npmLabel': 'notes par minute',
  'tech.evenLabel': 'régularité (constance du tempo)',
  'tech.clean': 'Passage propre — continuez à accélérer pour un nouveau record.',
  'tech.newBest': '🏆 Passage propre & nouveau record : {npm} notes/min !',
  'tech.notClean': '{pct} % — visez ≥95 % propre avant de chercher la vitesse.',
  'tech.again': 'Encore →',

  // Réglages
  'settings.title': 'Réglages',
  'settings.intro': 'Tout est enregistré sur cet appareil — aucun compte nécessaire.',
  'settings.audio': 'Audio',
  'settings.pianoSound': 'Jouer le son du piano',
  'settings.pianoSoundHint': 'Désactivez si vous entendez votre propre piano directement et ne voulez l’appli que pour le visuel.',
  'settings.volume': 'Volume',
  'settings.tone': 'Timbre du piano',
  'settings.toneHint': 'Le timbre du son de piano de l’appli.',
  'settings.toneGrand': 'Grand',
  'settings.toneDark': 'Sombre',
  'settings.toneLofi': 'Lo-fi',
  'settings.language': 'Langue',
  'settings.midi': 'Clavier MIDI',
  'settings.on': 'Activé',
  'settings.off': 'Désactivé',
  'settings.data': 'Vos données',
  'settings.dataHint': 'Tout votre historique et vos réglages restent dans ce navigateur. Rien n’est envoyé ailleurs.',
  'settings.reset': 'Réinitialiser mes données',
  'settings.resetConfirm': 'Effacer tout l’historique, la progression et les réglages sur cet appareil ? Action irréversible.',

  // Tutoriels (étapes séparées par |)
  'tut.title': 'Comment ça marche',
  'tut.mirror': 'Choisissez une entrée : piano MIDI, clavier à l’écran, ou la rangée A–; du clavier d’ordinateur.|Appuyez sur Enregistrer, attendez le décompte, puis jouez une courte phrase que vous connaissez.|Démarrez sur le temps — la grille rythmique se cale sur votre première note.|Appuyez sur Stop pour voir votre jeu écrit en partition, puis affinez et recommencez.',
  'tut.read': 'Une seule note est surlignée en bleu — jouez-la sur votre instrument.|Gardez une pulsation régulière ; les notes justes passent au vert, les erreurs clignotent en rouge.|Jouez toute la ligne sans vous arrêter ; le rythme est évalué à la fin.|Restez au-dessus de 92 % pour monter de niveau — la difficulté s’adapte pour vous garder vers 85 %.',
  'tut.fading': 'Choisissez un morceau que vous connaissez déjà d’oreille.|Jouez-le avec tous les indices affichés (noms de notes, doigtés, mesures).|Atteignez ≥90 % et la couche d’indices suivante s’efface.|Continuez jusqu’à ce que les mesures soient vides et que vous jouiez de mémoire.',
  'tut.improv': 'Appuyez sur Démarrer pour lancer l’accompagnement sur une grille d’accords.|Observez le clavier : les notes de l’accord et de la gamme s’allument pour l’accord en cours.|Improvisez avec les notes allumées ; ajoutez une carte contrainte pour pousser vos choix.|Ou lancez l’appel-réponse : écoutez une phrase, puis répétez-la.',
  'tut.technique': 'Choisissez un type d’exercice, une tonalité et la main à travailler.|Jouez le motif en montant puis en descendant, en suivant le doigté indiqué.|Gardez une pulsation régulière — vous êtes évalué sur la précision et la régularité.|Jouez-le proprement, puis accélérez ; votre meilleur tempo propre est enregistré.',
  'tut.progress': 'Tout ici est mesuré à partir de votre jeu réel — rien n’est auto-déclaré.|Pratiquez un peu chaque jour pour faire grandir votre série.|Lisez la tendance de précision et les barres par tonalité pour repérer les faiblesses.|Survolez un point du graphique pour les chiffres exacts.',
  'tut.settings': 'Désactivez le son de piano de l’appli si vous ne voulez que le visuel tout en entendant votre propre piano.|Choisissez un timbre de piano et réglez le volume.|Connectez un clavier MIDI, ou changez la langue.|Utilisez « Réinitialiser mes données » pour effacer votre historique et repartir de zéro.',

  // Progression
  'progress.title': 'Votre carte de compétences',
  'progress.intro': 'De courtes sessions quotidiennes, des progrès visibles. Tout ci-dessous est mesuré à partir de votre jeu réel dans les trois autres salles — rien n’est auto-déclaré.',
  'progress.level': 'niveau de déchiffrage',
  'progress.accuracy': 'précision, 10 derniers exercices',
  'progress.bestSpeed': 'meilleure vitesse de lecture (notes/min)',
  'progress.streak': 'jours d’affilée',
  'progress.notesPlayed': 'notes jouées dans Sightline',
  'progress.trendTitle': 'Tendance de précision au déchiffrage',
  'progress.keysTitle': 'Précision par tonalité',
  'progress.fadingTitle': 'Étapes de la partition qui s’efface',
  'progress.improvTitle': 'Improvisation',
  'progress.techniqueTitle': 'Technique — meilleur tempo propre',
  'progress.techniqueEmpty': 'Jouez un exercice technique propre (≥95 %) et vos meilleurs tempos apparaîtront ici.',
  'progress.techNpm': '{npm} n/min',
  'progress.trendEmpty': 'Terminez quelques exercices de déchiffrage et votre tendance apparaîtra ici.',
  'progress.keysEmpty': 'Pas encore de données de tonalité — la salle de déchiffrage les remplit.',
  'progress.keyTooltip': '{key} majeur · {total} notes',
  'progress.trendLabel': 'N{level} · {key} majeur · {date}',
  'progress.viewTable': 'Voir en tableau',
  'progress.colDate': 'Date',
  'progress.colLevel': 'Niveau',
  'progress.colKey': 'Tonalité',
  'progress.colAccuracy': 'Précision',
  'progress.colNpm': 'Notes/min',
  'progress.keyMajor': '{key} majeur',
  'progress.notStarted': 'pas commencé',
  'progress.run': '{n} passage',
  'progress.runs': '{n} passages',
  'progress.chordTonesLast': 'notes de l’accord, dernière session{prog}',
  'progress.bestCall': 'meilleur appel &amp; réponse',
  'progress.improvSessions': 'sessions d’impro',
};

const DICTS: Record<Lang, Dict> = { en: EN, fr: FR };

/** Translate a key, interpolating {placeholders} from params. */
export function t(key: string, params?: Record<string, string | number>): string {
  let s = DICTS[current][key] ?? EN[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return s;
}

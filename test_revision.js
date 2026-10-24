// Test du mode révision (quiz solo) : la liste des questions ne contient ni la
// bonne réponse ni l'explication ; la vérification renvoie le verdict, la bonne
// réponse et l'explication ; les entrées invalides sont refusées.
// Mode fichier forcé via une DATABASE_URL injoignable.
const PORT = 3094;
process.env.PORT = String(PORT);
process.env.DATABASE_URL = 'postgresql://devarena:devarena@127.0.0.1:59999/devarena';

require('./server.js');
const BASE = `http://localhost:${PORT}`;

console.log('=== [DEVARENA TEST DU MODE RÉVISION] ===\n');

const watchdog = setTimeout(() => {
  console.error('❌ TIMEOUT : le scénario du mode révision ne s\'est pas terminé en 20s.');
  process.exit(1);
}, 20000);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function check(id, body) {
  const res = await fetch(`${BASE}/api/revision/${id}/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  let json = {};
  try { json = await res.json(); } catch (_) { /* réponse vide */ }
  return { status: res.status, json };
}

async function run() {
  await new Promise(r => setTimeout(r, 800));
  const bank = require('./questions.json');

  // 1. Liste complète, sans réponse ni explication
  const listRes = await fetch(`${BASE}/api/revision/questions`);
  const { questions } = await listRes.json();
  assert(listRes.status === 200 && questions.length === bank.length, `Liste incomplète (${questions && questions.length}/${bank.length})`);
  const leaked = questions.filter(q => 'correctIndex' in q || 'explanation' in q);
  assert(leaked.length === 0, `${leaked.length} question(s) exposent leur réponse ou leur explication`);
  assert(questions.every(q => q.id && q.question && Array.isArray(q.options) && q.options.length === 4 && q.category), 'Champs publics manquants');
  console.log(`1. ✓ GET /api/revision/questions : ${questions.length} questions, sans bonne réponse ni explication`);

  // 2. Bonne réponse sur toute la banque
  for (const q of bank) {
    const { status, json } = await check(q.id, { answerIndex: q.correctIndex });
    assert(status === 200 && json.correct === true, `Question ${q.id} : la bonne réponse est refusée`);
    assert(json.correctIndex === q.correctIndex && json.correctAnswerText === q.options[q.correctIndex], `Question ${q.id} : bonne réponse mal renvoyée`);
    assert(json.explanation === q.explanation, `Question ${q.id} : explication manquante`);
  }
  console.log(`2. ✓ Les ${bank.length} bonnes réponses sont acceptées, avec explication`);

  // 3. Mauvaise réponse : verdict faux, bonne réponse et explication fournies
  const q1 = bank[0];
  const wrong = await check(q1.id, { answerIndex: (q1.correctIndex + 1) % 4 });
  assert(wrong.status === 200 && wrong.json.correct === false, 'Mauvaise réponse acceptée');
  assert(wrong.json.correctIndex === q1.correctIndex && wrong.json.explanation, 'Correction absente après une erreur');
  console.log('3. ✓ Mauvaise réponse : refusée, avec la bonne réponse et l\'explication');

  // 4. Entrées invalides
  assert((await check(99999, { answerIndex: 0 })).status === 404, 'Question inexistante : 404 attendu');
  assert((await check(q1.id, {})).status === 400, 'Sans réponse : 400 attendu');
  assert((await check(q1.id, { answerIndex: 4 })).status === 400, 'answerIndex 4 : 400 attendu');
  assert((await check(q1.id, { answerIndex: '1' })).status === 400, 'answerIndex texte : 400 attendu');
  console.log('4. ✓ Erreurs : 404 question inexistante, 400 réponse absente / hors bornes / non entière');

  // 5. Règles de progression (client.js chargé dans un faux navigateur)
  const fs = require('fs');
  const vm = require('vm');
  const store = {};
  const ctx = {
    document: { addEventListener() {}, getElementById() { return null; } },
    window: {},
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(require('path').join(__dirname, 'public/js/client.js'), 'utf8')
    + '\nthis.api = { recordRevisionAnswer, markQuestionsForReview, loadRevisionProgress };', ctx);
  const { recordRevisionAnswer, markQuestionsForReview, loadRevisionProgress } = ctx.api;

  const p = {};
  recordRevisionAnswer(p, 7, true);
  assert(p[7].streak === 1 && p[7].lastResult === 'ok', 'Une bonne réponse doit donner une série de 1');
  recordRevisionAnswer(p, 7, false);
  assert(p[7].streak === 0 && p[7].lastResult === 'ko' && p[7].attempts === 2, 'Une erreur doit remettre la série à zéro et marquer « à revoir »');
  recordRevisionAnswer(p, 7, true);
  recordRevisionAnswer(p, 7, true);
  assert(p[7].streak === 2 && p[7].correct === 3, 'Deux bonnes réponses d\'affilée = série de 2 (maîtrisée)');

  markQuestionsForReview([3, 5]);
  const saved = loadRevisionProgress();
  assert(saved[3].lastResult === 'ko' && saved[5].lastResult === 'ko', 'Les erreurs de partie doivent arriver « à revoir » en révision');
  console.log('5. ✓ Progression : erreur → à revoir, deux réussites d\'affilée → maîtrisée, erreurs de partie importées');

  console.log('\n✅ MODE RÉVISION VALIDÉ : QUESTIONS SANS RÉPONSE, CORRECTION CÔTÉ SERVEUR, ERREURS GÉRÉES !');
}

run()
  .then(() => {
    clearTimeout(watchdog);
    process.exit(0);
  })
  .catch(err => {
    console.error(`\n❌ ÉCHEC : ${err.message}`);
    process.exit(1);
  });

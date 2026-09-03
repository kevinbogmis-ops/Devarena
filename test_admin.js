// Test de l'éditeur de questions (API admin) : authentification par token,
// CRUD complet, validation des payloads et persistance dans questions.json.
// Le test travaille sur une COPIE du fichier (QUESTIONS_FILE) et force le mode
// fichier via une DATABASE_URL injoignable -> ni la vraie banque ni la vraie
// base ne sont modifiées.
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 3097;
const TOKEN = 'test-token-devarena';
const TMP_QUESTIONS = path.join(os.tmpdir(), `devarena_questions_admin_test_${Date.now()}.json`);

fs.copyFileSync(path.join(__dirname, 'questions.json'), TMP_QUESTIONS);

process.env.PORT = String(PORT);
process.env.ADMIN_TOKEN = TOKEN;
process.env.QUESTIONS_FILE = TMP_QUESTIONS;
// Port fermé -> échec de connexion immédiat, le serveur bascule en mode fichier
process.env.DATABASE_URL = 'postgresql://devarena:devarena@127.0.0.1:59999/devarena';

require('./server.js');
const BASE = `http://localhost:${PORT}`;

console.log('=== [DEVARENA TEST ÉDITEUR DE QUESTIONS] ===\n');

const watchdog = setTimeout(() => {
  console.error("❌ TIMEOUT : le scénario de l'éditeur ne s'est pas terminé en 20s.");
  cleanup();
  process.exit(1);
}, 20000);

function cleanup() {
  try { fs.unlinkSync(TMP_QUESTIONS); } catch (_) { /* déjà supprimé */ }
}

function readWorkingFile() {
  return JSON.parse(fs.readFileSync(TMP_QUESTIONS, 'utf8'));
}

async function call(method, urlPath, { token = TOKEN, body } = {}) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-admin-token': token } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  let json = {};
  try { json = await res.json(); } catch (_) { /* réponse vide */ }
  return { status: res.status, json };
}

const validPayload = {
  category: 'Docker',
  difficulty: 'Intermédiaire',
  question: 'TEST ADMIN : quelle option limite la mémoire d\'un conteneur ?',
  codeSnippet: 'docker run ... nginx',
  options: ['--memory', '--cpu-shares', '--limit-ram', '--max-heap'],
  correctIndex: 0,
  explanation: 'docker run --memory (ou -m) limite la RAM du conteneur.'
};

async function run() {
  await new Promise(r => setTimeout(r, 800));

  // 1. Sans token -> 401 ; mauvais token -> 401
  const noToken = await call('GET', '/api/admin/questions', { token: null });
  const badToken = await call('GET', '/api/admin/questions', { token: 'mauvais-token' });
  if (noToken.status !== 401 || badToken.status !== 401) {
    throw new Error(`Accès sans token valide non rejeté (${noToken.status} / ${badToken.status}).`);
  }
  console.log('1. ✓ Accès refusé (401) sans token ou avec un mauvais token');

  // 2. Liste complète avec le bon token
  const list = await call('GET', '/api/admin/questions');
  if (list.status !== 200 || !Array.isArray(list.json.questions) || list.json.total < 100) {
    throw new Error(`Liste admin invalide (status ${list.status}, total ${list.json.total}).`);
  }
  const initialTotal = list.json.total;
  console.log(`2. ✓ Liste admin accessible avec le token : ${initialTotal} questions (correctIndex inclus)`);

  // 3. Validation : payloads invalides rejetés en 400
  const bad1 = await call('POST', '/api/admin/questions', { body: { ...validPayload, options: ['a', 'b', 'c'] } });
  const bad2 = await call('POST', '/api/admin/questions', { body: { ...validPayload, correctIndex: 7 } });
  const bad3 = await call('POST', '/api/admin/questions', { body: { ...validPayload, difficulty: 'Impossible' } });
  if (bad1.status !== 400 || bad2.status !== 400 || bad3.status !== 400) {
    throw new Error(`Payload invalide accepté (${bad1.status} / ${bad2.status} / ${bad3.status}).`);
  }
  console.log('3. ✓ Validation : 3 options, correctIndex hors bornes et difficulté inconnue rejetés (400)');

  // 4. Création : id = max + 1, timeLimit déduit du niveau, écrit dans le fichier
  const created = await call('POST', '/api/admin/questions', { body: validPayload });
  if (created.status !== 201) throw new Error(`Création refusée (${created.status}: ${created.json.error}).`);
  const newId = created.json.question.id;
  if (created.json.question.timeLimit !== 25) {
    throw new Error(`timeLimit attendu 25 (Intermédiaire), reçu ${created.json.question.timeLimit}.`);
  }
  const afterCreate = readWorkingFile();
  if (afterCreate.length !== initialTotal + 1 || !afterCreate.some(q => q.id === newId)) {
    throw new Error('La question créée est absente du fichier questions.json.');
  }
  console.log(`4. ✓ Question #${newId} créée (timeLimit=25 auto) et persistée dans le fichier`);

  // 5. Modification
  const updated = await call('PUT', `/api/admin/questions/${newId}`, {
    body: { ...validPayload, question: 'TEST ADMIN (modifiée) : option mémoire de docker run ?', correctIndex: 1 }
  });
  if (updated.status !== 200 || updated.json.question.correctIndex !== 1) {
    throw new Error(`Modification échouée (${updated.status}).`);
  }
  const inFile = readWorkingFile().find(q => q.id === newId);
  if (!inFile || inFile.correctIndex !== 1 || !inFile.question.includes('(modifiée)')) {
    throw new Error('La modification n\'a pas été persistée dans le fichier.');
  }
  console.log(`5. ✓ Question #${newId} modifiée et persistée (nouvel énoncé + correctIndex)`);

  // 6. La question éditée est visible par le moteur de jeu (stats publiques)
  const stats = await call('GET', '/api/questions/stats', { token: null });
  if (stats.json.total !== initialTotal + 1) {
    throw new Error(`Le moteur ne voit pas la nouvelle question (stats: ${stats.json.total}).`);
  }
  console.log('6. ✓ La banque en mémoire du moteur de jeu est à jour (stats publiques)');

  // 7. Suppression (+ 404 sur id inexistant)
  const deleted = await call('DELETE', `/api/admin/questions/${newId}`);
  const notFound = await call('DELETE', '/api/admin/questions/999999');
  if (deleted.status !== 200 || notFound.status !== 404) {
    throw new Error(`Suppression incohérente (${deleted.status} / ${notFound.status}).`);
  }
  const afterDelete = readWorkingFile();
  if (afterDelete.length !== initialTotal || afterDelete.some(q => q.id === newId)) {
    throw new Error('La suppression n\'a pas été persistée dans le fichier.');
  }
  console.log(`7. ✓ Question #${newId} supprimée du fichier, 404 sur un id inexistant`);

  console.log('\n✅ ÉDITEUR DE QUESTIONS VALIDÉ : TOKEN, VALIDATION, CRUD ET PERSISTANCE FICHIER !');

  clearTimeout(watchdog);
  cleanup();
  setTimeout(() => process.exit(0), 200);
}

run().catch(err => {
  console.error("❌ ÉCHEC DU TEST DE L'ÉDITEUR :", err.message);
  cleanup();
  process.exit(1);
});

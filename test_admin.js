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
const TMP_COMMANDS = path.join(os.tmpdir(), `devarena_commands_admin_test_${Date.now()}.json`);
fs.copyFileSync(path.join(__dirname, 'commands.json'), TMP_COMMANDS);
process.env.COMMANDS_FILE = TMP_COMMANDS;

process.env.PORT = String(PORT);
process.env.ADMIN_TOKEN = TOKEN;
process.env.QUESTIONS_FILE = TMP_QUESTIONS;
// Port fermé -> échec de connexion immédiat, le serveur bascule en mode fichier
process.env.DATABASE_URL = 'postgresql://devarena:devarena@127.0.0.1:59999/devarena';
// Limites de tentatives abaissées pour le test (par visiteur / au global)
process.env.ADMIN_MAX_FAILS = '5';
process.env.ADMIN_GLOBAL_MAX_FAILS = '8';

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
  try { fs.unlinkSync(TMP_COMMANDS); } catch (_) { /* déjà supprimé */ }
}

function readWorkingLabs() {
  return JSON.parse(fs.readFileSync(TMP_COMMANDS, 'utf8'));
}

const validLab = {
  category: 'Docker',
  difficulty: 'Intermédiaire',
  mission: 'TEST ADMIN : affiche les volumes Docker de la machine.',
  solution: 'docker volume ls',
  accepted: ['docker volume list'],
  patterns: ['^docker volume (ls|list) (-q|--quiet)$'],
  hint: 'La sous-commande volume, puis lister.',
  explanation: '`docker volume ls` liste les volumes.'
};

function readWorkingFile() {
  return JSON.parse(fs.readFileSync(TMP_QUESTIONS, 'utf8'));
}

async function call(method, urlPath, { token = TOKEN, body, visitor } = {}) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-admin-token': token } : {}),
      // Simule un visiteur arrivé par le tunnel Cloudflare
      ...(visitor ? { 'cf-connecting-ip': visitor } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  let json = {};
  try { json = await res.json(); } catch (_) { /* réponse vide */ }
  return { status: res.status, json, retryAfter: res.headers.get('retry-after') };
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

  // 8. Labs : liste admin complète (avec solutions), validation des motifs
  const labList = await call('GET', '/api/admin/labs');
  if (labList.status !== 200 || !Array.isArray(labList.json.labs) || !labList.json.labs[0].solution) {
    throw new Error(`Liste admin des labs invalide (status ${labList.status}).`);
  }
  const initialLabs = labList.json.total;
  const notAnchored = await call('POST', '/api/admin/labs', { body: { ...validLab, patterns: ['docker volume ls'] } });
  const badRegex = await call('POST', '/api/admin/labs', { body: { ...validLab, patterns: ['^docker (volume$'] } });
  const noHint = await call('POST', '/api/admin/labs', { body: { ...validLab, hint: '' } });
  if (notAnchored.status !== 400 || badRegex.status !== 400 || noHint.status !== 400) {
    throw new Error(`Lab invalide accepté (${notAnchored.status} / ${badRegex.status} / ${noHint.status}).`);
  }
  console.log(`8. ✓ Labs : liste admin (${initialLabs} labs, solutions incluses) ; motif non ancré, regex invalide et indice vide rejetés (400)`);

  // 9. Banc d'essai sur un brouillon (rien n'est écrit)
  const tryOk = await call('POST', '/api/admin/labs/try', { body: { lab: validLab, answer: 'docker volume list --quiet' } });
  const tryKo = await call('POST', '/api/admin/labs/try', { body: { lab: validLab, answer: 'docker volume rm data' } });
  if (tryOk.json.accepted !== true || tryKo.json.accepted !== false || tryKo.json.near !== 'subcommand') {
    throw new Error(`Banc d'essai incohérent (${JSON.stringify(tryOk.json)} / ${JSON.stringify(tryKo.json)}).`);
  }
  if (readWorkingLabs().length !== initialLabs) throw new Error('Le banc d\'essai ne doit rien écrire.');
  console.log('9. ✓ Banc d\'essai : variante acceptée, erreur refusée avec indice de proximité, fichier inchangé');

  // 10. Création -> visible et jouable côté joueurs (sans la solution), puis modification
  const createdLab = await call('POST', '/api/admin/labs', { body: validLab });
  if (createdLab.status !== 201) throw new Error(`Création de lab refusée (${createdLab.status}: ${createdLab.json.error}).`);
  const labId = createdLab.json.lab.id;
  if (!readWorkingLabs().some(l => l.id === labId && l.solution === 'docker volume ls')) {
    throw new Error('Le lab créé est absent de commands.json.');
  }
  const publicLabs = await (await fetch(`${BASE}/api/labs`)).json();
  const publicLab = publicLabs.labs.find(l => l.id === labId);
  const played = await fetch(`${BASE}/api/labs/${labId}/check`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answer: 'docker volume list' })
  }).then(r => r.json());
  if (!publicLab || 'solution' in publicLab || played.correct !== true) {
    throw new Error('Le lab créé doit être jouable tout de suite, sans exposer sa solution.');
  }
  const updatedLab = await call('PUT', `/api/admin/labs/${labId}`, { body: { ...validLab, solution: 'docker volume ls -q', ignoreCase: true } });
  const inLabFile = readWorkingLabs().find(l => l.id === labId);
  if (updatedLab.status !== 200 || !inLabFile || inLabFile.solution !== 'docker volume ls -q' || inLabFile.ignoreCase !== true) {
    throw new Error(`Modification de lab échouée (${updatedLab.status}).`);
  }
  console.log(`10. ✓ Lab #${labId} créé (jouable aussitôt, solution non exposée) puis modifié, persisté dans commands.json`);

  // 11. Suppression (+ 404 sur id inexistant)
  const deletedLab = await call('DELETE', `/api/admin/labs/${labId}`);
  const missingLab = await call('DELETE', '/api/admin/labs/999999');
  if (deletedLab.status !== 200 || missingLab.status !== 404 || readWorkingLabs().length !== initialLabs) {
    throw new Error(`Suppression de lab incohérente (${deletedLab.status} / ${missingLab.status}).`);
  }
  console.log(`11. ✓ Lab #${labId} supprimé du fichier, 404 sur un id inexistant`);

  // 12. Limitation par visiteur : 5 échecs -> bloqué (429), même avec le bon token.
  //    (Échecs comptés jusqu'ici : 2 à l'étape 1, au global.)
  const attacker = '198.51.100.7';
  for (let i = 1; i <= 5; i++) {
    const r = await call('GET', '/api/admin/questions', { token: `essai-${i}`, visitor: attacker });
    if (r.status !== 401) throw new Error(`Essai ${i} : 401 attendu, reçu ${r.status}.`);
  }
  const locked = await call('GET', '/api/admin/questions', { token: 'essai-6', visitor: attacker });
  const lockedGood = await call('GET', '/api/admin/questions', { visitor: attacker });
  if (locked.status !== 429 || !locked.retryAfter || lockedGood.status !== 429) {
    throw new Error(`Blocage attendu après 5 échecs (reçu ${locked.status}, Retry-After ${locked.retryAfter}, bon token ${lockedGood.status}).`);
  }
  const otherVisitor = await call('GET', '/api/admin/questions', { visitor: '203.0.113.42' });
  if (otherVisitor.status !== 200) {
    throw new Error(`Un autre visiteur ne doit pas être bloqué (reçu ${otherVisitor.status}).`);
  }
  console.log(`12. ✓ Visiteur bloqué après 5 échecs (429, Retry-After ${locked.retryAfter}s, même avec le bon token) ; les autres visiteurs passent`);

  // 13. Limite globale : changer d'adresse ne contourne pas le plafond (8 échecs au total)
  const rotated = await call('GET', '/api/admin/questions', { token: 'essai-x', visitor: '192.0.2.99' });
  const anyone = await call('GET', '/api/admin/questions', { visitor: '203.0.113.42' });
  if (rotated.status !== 401 || anyone.status !== 429) {
    throw new Error(`Plafond global attendu (reçu ${rotated.status} puis ${anyone.status}).`);
  }
  console.log('13. ✓ Plafond global atteint : un attaquant qui change d\'adresse est arrêté (429 pour tous)');

  console.log("\n✅ ÉDITEUR VALIDÉ : TOKEN, LIMITATION DES TENTATIVES, QUESTIONS ET LABS (VALIDATION, CRUD, BANC D'ESSAI, PERSISTANCE FICHIER) !");

  clearTimeout(watchdog);
  cleanup();
  setTimeout(() => process.exit(0), 200);
}

run().catch(err => {
  console.error("❌ ÉCHEC DU TEST DE L'ÉDITEUR :", err.message);
  cleanup();
  process.exit(1);
});

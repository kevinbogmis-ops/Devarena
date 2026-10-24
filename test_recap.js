// Test des explications en fin de manche et du récapitulatif de fin de partie :
// l'hôte reçoit le TEXTE de la bonne réponse, et chaque joueur reçoit en fin de
// partie la liste de SES questions ratées (sa réponse, la bonne, l'explication).
const { io: Client } = require('socket.io-client');

process.env.PORT = 3095;
process.env.DATABASE_URL = 'postgresql://devarena:devarena@127.0.0.1:59999/devarena';
require('./server.js');
const SERVER_URL = 'http://localhost:3095';

console.log('=== [DEVARENA TEST DU RÉCAPITULATIF DE FIN DE PARTIE] ===\n');

const watchdog = setTimeout(() => {
  console.error('❌ TIMEOUT : le scénario du récapitulatif ne s\'est pas terminé en 30s.');
  process.exit(1);
}, 30000);

function waitFor(socket, event) {
  return new Promise(resolve => socket.once(event, resolve));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  await new Promise(r => setTimeout(r, 800));
  const bank = require('./questions.json');

  const host = Client(SERVER_URL);
  await waitFor(host, 'connect');
  host.emit('host:create_room');
  const { pin } = await waitFor(host, 'host:room_created');

  const alice = Client(SERVER_URL);
  await waitFor(alice, 'connect');
  alice.emit('player:join_room', { pin, nickname: 'Alice' });
  await waitFor(alice, 'player:join_success');

  const bob = Client(SERVER_URL);
  await waitFor(bob, 'connect');
  bob.emit('player:join_room', { pin, nickname: 'Bob' });
  await waitFor(bob, 'player:join_success');
  console.log(`1. ✓ Salle ${pin} : Alice et Bob ont rejoint`);

  // Partie de 2 questions sans mélange : l'ordre suit questions.json
  host.emit('host:start_game', { pin, questionCount: 2, shuffle: false });
  const wrong = q => (q.correctIndex + 1) % 4;

  // Question 1 : Alice juste, Bob faux
  await waitFor(alice, 'game:question_started');
  const round1Host = waitFor(host, 'game:round_ended');
  alice.emit('player:submit_answer', { pin, answerIndex: bank[0].correctIndex });
  bob.emit('player:submit_answer', { pin, answerIndex: wrong(bank[0]) });
  const r1 = await round1Host;

  const expectedText = bank[0].options[bank[0].correctIndex];
  assert(r1.correctAnswerText === expectedText,
    `L'hôte doit recevoir le texte de la bonne réponse (attendu « ${expectedText} », reçu « ${r1.correctAnswerText} »)`);
  assert(r1.explanation === bank[0].explanation, 'Explication absente de la fin de manche côté hôte');
  console.log(`2. ✓ Fin de manche côté hôte : [${'ABCD'[r1.correctIndex]}] « ${r1.correctAnswerText} » + explication`);

  // Question 2 : Alice juste, Bob faux
  const q2 = waitFor(alice, 'game:question_started');
  host.emit('host:next_question', { pin });
  await q2;
  const round2Host = waitFor(host, 'game:round_ended');
  alice.emit('player:submit_answer', { pin, answerIndex: bank[1].correctIndex });
  bob.emit('player:submit_answer', { pin, answerIndex: wrong(bank[1]) });
  await round2Host;

  // Fin de partie : chaque joueur reçoit son récapitulatif
  const aliceRecapP = waitFor(alice, 'player:game_recap');
  const bobRecapP = waitFor(bob, 'player:game_recap');
  host.emit('host:next_question', { pin });
  const [aliceRecap, bobRecap] = await Promise.all([aliceRecapP, bobRecapP]);

  assert(aliceRecap.totalQuestions === 2 && aliceRecap.mistakes.length === 0,
    `Alice a tout juste : 0 erreur attendue, reçu ${aliceRecap.mistakes.length}`);
  console.log('3. ✓ Récapitulatif d\'Alice : sans faute (aucune erreur des autres joueurs ne lui est envoyée)');

  assert(bobRecap.mistakes.length === 2, `Bob doit avoir 2 erreurs, reçu ${bobRecap.mistakes.length}`);
  bobRecap.mistakes.forEach((m, i) => {
    const q = bank[i];
    assert(m.questionNumber === i + 1, `Erreur ${i + 1} : numéro de question incorrect (${m.questionNumber})`);
    assert(m.questionId === q.id, `Erreur ${i + 1} : identifiant de question manquant (utilisé par le mode révision)`);
    assert(m.question === q.question, `Erreur ${i + 1} : énoncé incorrect`);
    assert(m.yourAnswer === q.options[wrong(q)], `Erreur ${i + 1} : « ta réponse » incorrecte`);
    assert(m.correctAnswer === q.options[q.correctIndex], `Erreur ${i + 1} : bonne réponse incorrecte`);
    assert(m.explanation === q.explanation, `Erreur ${i + 1} : explication manquante`);
    assert(m.category === q.category && m.difficulty === q.difficulty, `Erreur ${i + 1} : catégorie/niveau manquants`);
  });
  console.log('4. ✓ Récapitulatif de Bob : 2 erreurs, avec sa réponse, la bonne réponse et l\'explication');

  console.log('\n✅ EXPLICATIONS ET RÉCAPITULATIF VALIDÉS : TEXTE DE LA RÉPONSE CÔTÉ HÔTE, ERREURS PERSONNELLES EN FIN DE PARTIE !');

  clearTimeout(watchdog);
  host.disconnect();
  alice.disconnect();
  bob.disconnect();
  setTimeout(() => process.exit(0), 300);
}

run().catch(err => {
  console.error('❌ ÉCHEC DU TEST DU RÉCAPITULATIF :', err.message);
  process.exit(1);
});

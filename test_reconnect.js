// Test de reconnexion : un joueur se déconnecte en pleine partie puis revient
// avec le même pseudo -> son score et sa place doivent être conservés.
const { io: Client } = require('socket.io-client');

process.env.PORT = 3098;
require('./server.js');
const SERVER_URL = 'http://localhost:3098';

console.log('=== [DEVARENA TEST DE RECONNEXION JOUEUR] ===\n');

// Garde-fou : échec si le scénario ne se termine pas en 30 secondes
const watchdog = setTimeout(() => {
  console.error('❌ TIMEOUT : le scénario de reconnexion ne s\'est pas terminé en 30s.');
  process.exit(1);
}, 30000);

function waitFor(socket, event) {
  return new Promise(resolve => socket.once(event, resolve));
}

async function run() {
  await new Promise(r => setTimeout(r, 800));

  // 1. Host crée la salle
  const host = Client(SERVER_URL);
  await waitFor(host, 'connect');
  host.emit('host:create_room');
  const { pin } = await waitFor(host, 'host:room_created');
  console.log(`1. ✓ Salle créée : PIN ${pin}`);

  // 2. Alice et Bob rejoignent
  const alice = Client(SERVER_URL);
  await waitFor(alice, 'connect');
  alice.emit('player:join_room', { pin, nickname: 'Alice' });
  await waitFor(alice, 'player:join_success');

  const bob = Client(SERVER_URL);
  await waitFor(bob, 'connect');
  bob.emit('player:join_room', { pin, nickname: 'Bob' });
  await waitFor(bob, 'player:join_success');
  console.log('2. ✓ Alice et Bob ont rejoint');

  // 3. Partie de 2 questions SANS mélange : l'ordre suit questions.json,
  // ce qui permet de faire répondre Alice juste pour garantir un score > 0.
  const questionBank = require('./questions.json');
  host.emit('host:start_game', { pin, questionCount: 2, shuffle: false });

  // Question 1 : Alice répond juste, Bob répond faux
  await waitFor(alice, 'game:question_started');
  alice.emit('player:submit_answer', { pin, answerIndex: questionBank[0].correctIndex });
  bob.emit('player:submit_answer', { pin, answerIndex: (questionBank[0].correctIndex + 1) % 4 });
  const round1 = await waitFor(alice, 'player:round_result');
  const aliceScoreQ1 = round1.currentScore;
  if (aliceScoreQ1 <= 0) {
    throw new Error('Alice devait marquer des points à la question 1 (réponse correcte envoyée) !');
  }
  console.log(`3. ✓ Question 1 jouée. Score d'Alice : ${aliceScoreQ1} pts`);

  // 4. Alice se déconnecte brutalement (écran verrouillé...)
  alice.disconnect();
  await new Promise(r => setTimeout(r, 400));
  console.log('4. ✓ Alice déconnectée en pleine partie');

  // 5. Alice revient avec le même pseudo
  const alice2 = Client(SERVER_URL);
  await waitFor(alice2, 'connect');
  alice2.emit('player:join_room', { pin, nickname: 'Alice' });
  const rejoin = await waitFor(alice2, 'player:join_success');

  if (!rejoin.resumed) {
    throw new Error('La reconnexion n\'a pas été détectée comme une reprise (resumed manquant) !');
  }
  if (rejoin.player.score !== aliceScoreQ1) {
    throw new Error(`Score perdu à la reconnexion ! Attendu ${aliceScoreQ1}, reçu ${rejoin.player.score}`);
  }
  console.log(`5. ✓ Alice reconnectée : reprise confirmée, score conservé (${rejoin.player.score} pts)`);

  // 6. La partie continue : question 2 puis podium
  const q2Promise = waitFor(alice2, 'game:question_started');
  host.emit('host:next_question', { pin });
  await q2Promise;
  alice2.emit('player:submit_answer', { pin, answerIndex: 1 });
  bob.emit('player:submit_answer', { pin, answerIndex: 1 });
  await waitFor(alice2, 'player:round_result');
  console.log('6. ✓ Alice a répondu à la question 2 après sa reconnexion');

  const gameOverPromise = waitFor(alice2, 'game:game_over');
  host.emit('host:next_question', { pin });
  const { fullRanking } = await gameOverPromise;

  const aliceFinal = fullRanking.find(p => p.nickname === 'Alice');
  if (!aliceFinal) {
    throw new Error('Alice absente du classement final !');
  }
  if (aliceFinal.score < aliceScoreQ1) {
    throw new Error(`Le score final d'Alice (${aliceFinal.score}) est inférieur à son score d'avant déconnexion (${aliceScoreQ1}) !`);
  }
  console.log(`7. ✓ Classement final : Alice #${aliceFinal.rank} avec ${aliceFinal.score} pts (cumul conservé)`);

  console.log('\n✅ RECONNEXION JOUEUR VALIDÉE : SCORE ET PLACE CONSERVÉS !');

  clearTimeout(watchdog);
  host.disconnect();
  alice2.disconnect();
  bob.disconnect();
  setTimeout(() => process.exit(0), 300);
}

run().catch(err => {
  console.error('❌ ÉCHEC DU TEST DE RECONNEXION :', err.message);
  process.exit(1);
});

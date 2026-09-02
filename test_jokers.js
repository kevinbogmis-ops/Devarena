// Test du système de jokers : accumulation d'énergie, attaque DDoS ciblée,
// rejets (énergie insuffisante) et doublement de points via sudo boost.
const { io: Client } = require('socket.io-client');

process.env.PORT = 3097;
require('./server.js');
const SERVER_URL = 'http://localhost:3097';

console.log('=== [DEVARENA TEST DU SYSTÈME DE JOKERS] ===\n');

const watchdog = setTimeout(() => {
  console.error('❌ TIMEOUT : le scénario jokers ne s\'est pas terminé en 45s.');
  process.exit(1);
}, 45000);

function waitFor(socket, event) {
  return new Promise(resolve => socket.once(event, resolve));
}

async function run() {
  await new Promise(r => setTimeout(r, 800));
  const questionBank = require('./questions.json');

  // 1. Mise en place : host + Alice + Bob
  const host = Client(SERVER_URL);
  await waitFor(host, 'connect');
  host.emit('host:create_room');
  const { pin } = await waitFor(host, 'host:room_created');

  const alice = Client(SERVER_URL);
  await waitFor(alice, 'connect');
  alice.emit('player:join_room', { pin, nickname: 'Alice' });
  const aliceJoin = await waitFor(alice, 'player:join_success');
  if (!Array.isArray(aliceJoin.jokers) || aliceJoin.jokers.length !== 6) {
    throw new Error(`Le catalogue de jokers devait contenir 6 entrées (reçu: ${aliceJoin.jokers?.length}).`);
  }
  console.log(`1. ✓ Salle ${pin} prête, catalogue de 6 jokers reçu au join`);

  const bob = Client(SERVER_URL);
  await waitFor(bob, 'connect');
  bob.emit('player:join_room', { pin, nickname: 'Bob' });
  await waitFor(bob, 'player:join_success');

  // Helper : jouer une question où les deux répondent correctement
  // (Alice répond plus vite -> elle reste 1re au classement)
  async function playRound(qIndex, { aliceUsesJoker = null, bobUsesJoker = null, expectBobError = false } = {}) {
    await waitFor(alice, 'game:question_started');

    if (bobUsesJoker) {
      bob.emit('player:use_joker', { pin, jokerId: bobUsesJoker });
      await waitFor(bob, expectBobError ? 'joker:error' : 'joker:use_ack');
    }
    if (aliceUsesJoker) {
      alice.emit('player:use_joker', { pin, jokerId: aliceUsesJoker });
      await waitFor(alice, 'joker:use_ack');
    }

    const correct = questionBank[qIndex].correctIndex;
    alice.emit('player:submit_answer', { pin, answerIndex: correct });
    setTimeout(() => bob.emit('player:submit_answer', { pin, answerIndex: correct }), 250);
    const result = await waitFor(alice, 'player:round_result');
    return result;
  }

  // 2. Partie de 4 questions sans mélange (ordre connu)
  host.emit('host:start_game', { pin, questionCount: 4, shuffle: false });

  // Q1 et Q2 : les deux engrangent de l'énergie (10 puis 15 = 25 ⚡)
  let res = await playRound(0);
  if (res.energy !== 10) throw new Error(`Énergie d'Alice après Q1 : attendu 10, reçu ${res.energy}`);
  host.emit('host:next_question', { pin });
  res = await playRound(1);
  if (res.energy !== 25) throw new Error(`Énergie d'Alice après Q2 : attendu 25 (10+15), reçu ${res.energy}`);
  console.log('2. ✓ Accumulation d\'énergie validée : 10 ⚡ (streak 1) puis +15 ⚡ (streak 2)');

  // 3. Q3 : Bob (2e) lance un DDoS -> la cible doit être Alice (juste au-dessus)
  host.emit('host:next_question', { pin });
  const attackPromise = waitFor(alice, 'joker:attacked');
  const hostEventPromise = waitFor(host, 'host:joker_event');

  await waitFor(bob, 'game:question_started');
  bob.emit('player:use_joker', { pin, jokerId: 'ddos' });
  const bobAck = await waitFor(bob, 'joker:use_ack');
  if (bobAck.energy !== 0) throw new Error(`Énergie de Bob après DDoS : attendu 0 (25-25), reçu ${bobAck.energy}`);

  const attack = await attackPromise;
  if (attack.type !== 'ddos' || attack.from !== 'Bob') {
    throw new Error(`Attaque mal routée : ${JSON.stringify(attack)}`);
  }
  console.log('3. ✓ DDoS de Bob correctement routé vers Alice (le joueur au-dessus) avec débit d\'énergie');

  const hostEvent = await hostEventPromise;
  if (hostEvent.from !== 'Bob' || hostEvent.target !== 'Alice') {
    throw new Error(`Événement Host incorrect : ${JSON.stringify(hostEvent)}`);
  }
  console.log('4. ✓ L\'écran Host a reçu l\'événement joker (fil d\'arène)');

  // Bob retente une attaque (rot13) : rejet attendu (0 ⚡ et offensif déjà utilisé)
  bob.emit('player:use_joker', { pin, jokerId: 'rot13' });
  await waitFor(bob, 'joker:error');
  console.log('5. ✓ Deuxième joker offensif de Bob rejeté (limite/énergie)');

  // Fin de la Q3 : les deux répondent juste (Alice : 25+20 = 45 ⚡)
  const correct3 = questionBank[2].correctIndex;
  alice.emit('player:submit_answer', { pin, answerIndex: correct3 });
  setTimeout(() => bob.emit('player:submit_answer', { pin, answerIndex: correct3 }), 250);
  res = await waitFor(alice, 'player:round_result');
  if (res.energy !== 45) throw new Error(`Énergie d'Alice après Q3 : attendu 45 (25+20), reçu ${res.energy}`);

  // 4. Q4 : Alice active sudo boost (45 ⚡) -> ses points doivent être doublés
  host.emit('host:next_question', { pin });
  await waitFor(alice, 'game:question_started');
  alice.emit('player:use_joker', { pin, jokerId: 'boost' });
  const aliceAck = await waitFor(alice, 'joker:use_ack');
  if (aliceAck.energy !== 0) throw new Error(`Énergie d'Alice après boost : attendu 0 (45-45), reçu ${aliceAck.energy}`);

  const correct4 = questionBank[3].correctIndex;
  alice.emit('player:submit_answer', { pin, answerIndex: correct4 });
  setTimeout(() => bob.emit('player:submit_answer', { pin, answerIndex: correct4 }), 250);
  res = await waitFor(alice, 'player:round_result');

  // Sans boost, le maximum théorique est 1000 + 250 de streak = 1250.
  if (res.pointsGained <= 1250) {
    throw new Error(`sudo boost inopérant : ${res.pointsGained} pts gagnés (attendu > 1250 grâce au x2)`);
  }
  console.log(`6. ✓ sudo boost validé : ${res.pointsGained} pts sur la Q4 (> 1250, donc doublés)`);

  console.log('\n✅ SYSTÈME DE JOKERS VALIDÉ : ÉNERGIE, ATTAQUES CIBLÉES, LIMITES ET BOOST !');

  clearTimeout(watchdog);
  host.disconnect();
  alice.disconnect();
  bob.disconnect();
  setTimeout(() => process.exit(0), 300);
}

run().catch(err => {
  console.error('❌ ÉCHEC DU TEST JOKERS :', err.message);
  process.exit(1);
});

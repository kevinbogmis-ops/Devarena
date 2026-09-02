// Test de persistance PostgreSQL : simule une partie complète contre le serveur
// conteneurisé, puis vérifie que le résultat est bien enregistré via /api/scores/top.
const { io: Client } = require('socket.io-client');

const SERVER_URL = process.env.TEST_URL || 'http://localhost:3300';

async function run() {
  console.log(`=== Test persistance PostgreSQL (${SERVER_URL}) ===\n`);

  const health = await fetch(`${SERVER_URL}/health`).then(r => r.json());
  if (health.database !== 'connected') {
    throw new Error(`La base n'est pas connectée (database=${health.database})`);
  }
  console.log('✓ /health : base connectée');

  const host = Client(SERVER_URL);
  let pin = null;

  await new Promise(resolve => {
    host.on('connect', () => host.emit('host:create_room'));
    host.on('host:room_created', (data) => { pin = data.pin; resolve(); });
  });
  console.log(`✓ Salle créée : PIN ${pin}`);

  // Le joueur n'est créé qu'une fois le PIN connu, pour émettre le join après connexion
  const player = Client(SERVER_URL);
  await new Promise(resolve => {
    player.on('connect', () => player.emit('player:join_room', { pin, nickname: 'TestPersist' }));
    player.on('player:join_success', resolve);
  });
  console.log('✓ Joueur "TestPersist" a rejoint');

  const gameOver = new Promise(resolve => player.on('game:game_over', resolve));

  player.on('game:question_started', () => {
    setTimeout(() => player.emit('player:submit_answer', { pin, answerIndex: 0 }), 200);
  });
  host.on('game:round_ended', ({ isLastQuestion }) => {
    setTimeout(() => host.emit('host:next_question', { pin }), 300);
  });

  host.emit('host:start_game', { pin, questionCount: 2, shuffle: true });
  console.log('✓ Partie lancée (2 questions)...');

  const result = await gameOver;
  const me = result.fullRanking.find(p => p.nickname === 'TestPersist');
  console.log(`✓ Partie terminée : score final ${me.score} pts`);

  // Laisser le temps à l'écriture asynchrone en base
  await new Promise(r => setTimeout(r, 1000));

  const { topScores } = await fetch(`${SERVER_URL}/api/scores/top`).then(r => r.json());
  const saved = topScores.find(s => s.nickname === 'TestPersist');
  if (!saved) {
    throw new Error('Le score n\'a pas été retrouvé dans /api/scores/top !');
  }
  console.log(`✓ Score persisté en base : ${saved.nickname} -> ${saved.score} pts (partie du ${saved.played_at})`);

  host.disconnect();
  player.disconnect();
  console.log('\n✅ PERSISTANCE POSTGRESQL VALIDÉE !');
  // Pas de process.exit(0) : on laisse la boucle d'événements se vider naturellement
  // (process.exit avec des sockets en fermeture déclenche une assertion libuv sous Windows)
}

run().catch(err => {
  console.error('❌ ÉCHEC :', err.message);
  process.exit(1);
});

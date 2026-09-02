// Test de reconnexion de l'hôte : l'hôte se déconnecte en pleine partie,
// la salle survit (grâce), il se reconnecte avec le PIN et récupère l'état.
const { io: Client } = require('socket.io-client');

process.env.PORT = 3096;
require('./server.js');
const SERVER_URL = 'http://localhost:3096';

console.log('=== [DEVARENA TEST DE RECONNEXION DE L\'HÔTE] ===\n');

const watchdog = setTimeout(() => {
  console.error('❌ TIMEOUT : le scénario de reconnexion hôte ne s\'est pas terminé en 30s.');
  process.exit(1);
}, 30000);

function waitFor(socket, event) {
  return new Promise(resolve => socket.once(event, resolve));
}

async function run() {
  await new Promise(r => setTimeout(r, 800));

  // 1. Host crée une salle, un joueur rejoint
  let host = Client(SERVER_URL);
  await waitFor(host, 'connect');
  host.emit('host:create_room');
  const { pin } = await waitFor(host, 'host:room_created');
  console.log(`1. ✓ Salle créée : PIN ${pin}`);

  const player = Client(SERVER_URL);
  await waitFor(player, 'connect');
  player.emit('player:join_room', { pin, nickname: 'Alice' });
  await waitFor(player, 'player:join_success');
  console.log('2. ✓ Alice a rejoint');

  // 2. Démarrage : on va jusqu'à la première question
  host.emit('host:start_game', { pin, questionCount: 3, shuffle: false });
  await waitFor(player, 'game:question_started');
  console.log('3. ✓ Partie démarrée, question 1 en cours');

  // 3. L'hôte se déconnecte brutalement (rechargement de page)
  const hostPausedPromise = waitFor(player, 'game:host_paused');
  host.disconnect();
  const paused = await hostPausedPromise;
  if (!paused) throw new Error('Les joueurs n\'ont pas été notifiés de la pause hôte !');
  console.log('4. ✓ Hôte déconnecté : la salle survit, Alice reçoit game:host_paused');

  // 4. Vérifier que la partie n'a PAS été détruite : Alice peut encore répondre
  await new Promise(r => setTimeout(r, 500));
  player.emit('player:submit_answer', { pin, answerIndex: 0 });
  const roundResult = await waitFor(player, 'player:round_result');
  console.log(`5. ✓ La partie continue sans l'hôte (Alice a pu répondre, score ${roundResult.currentScore})`);

  // 5. L'hôte se reconnecte avec le même PIN (nouveau socket)
  host = Client(SERVER_URL);
  await waitFor(host, 'connect');
  const resumedPromise = waitFor(player, 'game:host_resumed');
  host.emit('host:reconnect', { pin });
  const reconnected = await waitFor(host, 'host:reconnected');

  if (reconnected.pin !== pin) {
    throw new Error(`PIN incorrect à la reconnexion : ${reconnected.pin} au lieu de ${pin}`);
  }
  if (!reconnected.catalog || Object.keys(reconnected.catalog).length === 0) {
    throw new Error('Le catalogue n\'a pas été rétabli à la reconnexion de l\'hôte !');
  }
  console.log(`6. ✓ Hôte reconnecté : PIN et catalogue rétablis (état ${reconnected.state})`);

  await resumedPromise;
  console.log('7. ✓ Alice a été notifiée du retour de l\'hôte (game:host_resumed)');

  // 6. L'hôte reprend le contrôle : passage à la question suivante
  const nextQPromise = waitFor(player, 'game:question_started');
  host.emit('host:next_question', { pin });
  await nextQPromise;
  console.log('8. ✓ L\'hôte pilote de nouveau la partie (question suivante lancée)');

  // 7. Reconnexion sur un PIN inexistant -> échec propre
  const ghost = Client(SERVER_URL);
  await waitFor(ghost, 'connect');
  ghost.emit('host:reconnect', { pin: '000000' });
  await waitFor(ghost, 'host:reconnect_failed');
  console.log('9. ✓ Reconnexion sur salle inexistante : échec propre (host:reconnect_failed)');

  console.log('\n✅ RECONNEXION DE L\'HÔTE VALIDÉE : SALLE PRÉSERVÉE ET ÉTAT RÉTABLI !');

  clearTimeout(watchdog);
  host.disconnect();
  player.disconnect();
  ghost.disconnect();
  setTimeout(() => process.exit(0), 300);
}

run().catch(err => {
  console.error('❌ ÉCHEC DU TEST DE RECONNEXION HÔTE :', err.message);
  process.exit(1);
});

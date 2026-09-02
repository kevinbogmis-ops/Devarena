// Test de durcissement : unicité des PIN, nettoyage des salles abandonnées,
// et CORS configurable. Les TTL de nettoyage sont réglés très courts via l'env.
const { io: Client } = require('socket.io-client');

process.env.PORT = 3095;
// Nettoyage agressif pour rendre le test rapide : balayage toutes les 500ms,
// salle terminée supprimée après 800ms, salle inactive après 1200ms.
process.env.ROOM_SWEEP_INTERVAL_MS = '500';
process.env.ROOM_GAMEOVER_TTL_MS = '800';
process.env.ROOM_IDLE_TTL_MS = '1200';
process.env.CORS_ORIGIN = 'https://devarena.example';

require('./server.js');
const SERVER_URL = 'http://localhost:3095';

console.log('=== [DEVARENA TEST DE DURCISSEMENT] ===\n');

const watchdog = setTimeout(() => {
  console.error('❌ TIMEOUT : le scénario de durcissement ne s\'est pas terminé en 20s.');
  process.exit(1);
}, 20000);

function waitFor(socket, event) {
  return new Promise(resolve => socket.once(event, resolve));
}

async function getActiveRooms() {
  const res = await fetch(`${SERVER_URL}/health`).then(r => r.json());
  return res.activeRooms;
}

async function run() {
  await new Promise(r => setTimeout(r, 800));

  // 1. Unicité des PIN : créer plusieurs salles et vérifier qu'aucun PIN ne se répète
  const pins = new Set();
  const hosts = [];
  for (let i = 0; i < 20; i++) {
    const h = Client(SERVER_URL);
    await waitFor(h, 'connect');
    h.emit('host:create_room');
    const { pin } = await waitFor(h, 'host:room_created');
    if (pins.has(pin)) throw new Error(`PIN dupliqué détecté : ${pin} !`);
    if (!/^\d{6}$/.test(pin)) throw new Error(`PIN mal formé : ${pin}`);
    pins.add(pin);
    hosts.push(h);
  }
  console.log(`1. ✓ 20 salles créées avec 20 PIN uniques à 6 chiffres`);

  // 2. Nettoyage des salles abandonnées : on déconnecte tous les hôtes.
  // Les salles sont en LOBBY sans joueur -> supprimées après ROOM_IDLE_TTL_MS.
  const before = await getActiveRooms();
  console.log(`2. ✓ ${before} salles actives avant nettoyage`);

  hosts.forEach(h => h.disconnect());

  // Attendre que le balayage passe (idle TTL 1200ms + marge)
  await new Promise(r => setTimeout(r, 2500));
  const after = await getActiveRooms();
  if (after !== 0) {
    throw new Error(`Nettoyage incomplet : ${after} salle(s) subsistent après le TTL d'inactivité.`);
  }
  console.log(`3. ✓ Nettoyage automatique : ${before} → ${after} salle(s) après expiration du TTL`);

  // 3. CORS : le serveur a démarré avec une origine restreinte sans planter,
  // et /health reste accessible (même origine).
  const health = await fetch(`${SERVER_URL}/health`).then(r => r.json());
  if (health.status !== 'ok') throw new Error('Le serveur ne répond pas correctement avec CORS restreint.');
  console.log('4. ✓ Serveur opérationnel avec CORS restreint (CORS_ORIGIN=https://devarena.example)');

  console.log('\n✅ DURCISSEMENT VALIDÉ : PIN UNIQUES, NETTOYAGE AUTO, CORS CONFIGURABLE !');

  clearTimeout(watchdog);
  setTimeout(() => process.exit(0), 200);
}

run().catch(err => {
  console.error('❌ ÉCHEC DU TEST DE DURCISSEMENT :', err.message);
  process.exit(1);
});

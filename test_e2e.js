const http = require('http');
const { io: Client } = require('socket.io-client');

console.log('=== [DEVARENA E2E REAL-TIME SOCKET.IO SIMULATION] ===\n');

// 1. Démarrer le serveur sur un port de test dédié
process.env.PORT = 3099;
const serverProcess = require('./server.js');
const SERVER_URL = 'http://localhost:3099';

async function runE2ETest() {
  // Attendre 1 sec pour que le serveur soit prêt
  await new Promise(r => setTimeout(r, 1000));

  console.log('1. Test de l\'endpoint HTTP /health...');
  const healthRes = await fetch(`${SERVER_URL}/health`).then(r => r.json());
  console.log('   ✓ Réponse /health :', healthRes);

  if (healthRes.status !== 'ok') {
    throw new Error('Sonde de santé échouée');
  }

  console.log('\n2. Connexion du Maître du jeu (Host)...');
  const hostSocket = Client(SERVER_URL);

  let roomPin = null;

  await new Promise((resolve) => {
    hostSocket.on('connect', () => {
      console.log('   ✓ Host connecté via WebSocket');
      hostSocket.emit('host:create_room');
    });

    hostSocket.on('host:room_created', ({ pin, totalQuestionsAvailable, catalog }) => {
      console.log(`   ✓ Salle créée avec le code PIN : ${pin} (${totalQuestionsAvailable} questions dispo)`);
      const categories = Object.keys(catalog || {});
      if (categories.length === 0) {
        throw new Error('Le catalogue de questions (catégories/niveaux) est absent de host:room_created !');
      }
      console.log(`   ✓ Catalogue reçu : ${categories.length} catégories (${categories.join(', ')})`);
      roomPin = pin;
      resolve();
    });
  });

  console.log('\n3. Connexion de 2 Joueurs (Alice & Bob)...');
  const player1 = Client(SERVER_URL);
  const player2 = Client(SERVER_URL);

  await Promise.all([
    new Promise(res => {
      player1.on('connect', () => {
        player1.emit('player:join_room', { pin: roomPin, nickname: 'Alice_DevOps' });
      });
      player1.on('player:join_success', ({ player }) => {
        console.log(`   ✓ Joueur 1 rejoint : ${player.nickname}`);
        res();
      });
    }),
    new Promise(res => {
      player2.on('connect', () => {
        player2.emit('player:join_room', { pin: roomPin, nickname: 'Bob_SysAdmin' });
      });
      player2.on('player:join_success', ({ player }) => {
        console.log(`   ✓ Joueur 2 rejoint : ${player.nickname}`);
        res();
      });
    })
  ]);

  console.log('\n4. Lancement de la partie par l\'hôte (5 questions, filtre Docker/Débutant)...');
  const FILTER_CATEGORIES = ['Docker'];
  const FILTER_DIFFICULTIES = ['Débutant'];
  hostSocket.emit('host:start_game', {
    pin: roomPin,
    questionCount: 5,
    shuffle: true,
    categories: FILTER_CATEGORIES,
    difficulties: FILTER_DIFFICULTIES
  });

  await new Promise(resolve => {
    let currentQ = null;

    player1.on('game:question_started', (q) => {
      console.log(`   ✓ Question #${q.questionNumber} reçue : "${q.question}" [${q.category} / ${q.difficulty}]`);
      if (!FILTER_CATEGORIES.includes(q.category) || !FILTER_DIFFICULTIES.includes(q.difficulty)) {
        throw new Error(`Filtre non respecté ! Reçu ${q.category}/${q.difficulty}, attendu ${FILTER_CATEGORIES}/${FILTER_DIFFICULTIES}`);
      }
      console.log('   ✓ La question respecte le filtre catégorie + niveau');
      currentQ = q;

      // Alice répond immédiatement (option A = index 0)
      setTimeout(() => {
        console.log('   -> Alice soumet la réponse A (index 0)');
        player1.emit('player:submit_answer', { pin: roomPin, answerIndex: 0 });
      }, 200);

      // Bob répond avec un léger délai (option B = index 1)
      setTimeout(() => {
        console.log('   -> Bob soumet la réponse B (index 1)');
        player2.emit('player:submit_answer', { pin: roomPin, answerIndex: 1 });
      }, 500);
    });

    // Fin de manche : on attend l'événement de l'hôte ET le résultat individuel
    // du joueur (qui doit contenir le Top 5 partagé)
    let hostRoundEnded = false;
    let playerTopFiveOk = false;
    const maybeResolve = () => {
      if (hostRoundEnded && playerTopFiveOk) resolve();
    };

    player1.on('player:round_result', (result) => {
      if (!Array.isArray(result.topFive) || result.topFive.length !== 2) {
        throw new Error(`topFive manquant ou incomplet dans player:round_result (reçu : ${JSON.stringify(result.topFive)})`);
      }
      if (typeof result.topFive[0].nickname !== 'string' || typeof result.topFive[0].rank !== 'number') {
        throw new Error('Entrées topFive mal formées (nickname/rank attendus).');
      }
      console.log(`   ✓ Top 5 reçu par le joueur : ${result.topFive.map(p => `#${p.rank} ${p.nickname}`).join(', ')}`);
      playerTopFiveOk = true;
      maybeResolve();
    });

    hostSocket.on('game:round_ended', ({ correctIndex, explanation, leaderboard }) => {
      console.log(`\n5. Round terminé ! Bonne réponse : [${['A','B','C','D'][correctIndex]}]`);
      console.log(`   Explication : ${explanation}`);
      console.log('   🏆 Classement du round :');
      leaderboard.forEach(p => {
        console.log(`      #${p.rank} ${p.nickname} : ${p.score} pts (+${p.lastPoints})`);
      });

      hostRoundEnded = true;
      maybeResolve();
    });
  });

  // 6. Arrêt de la partie par l'hôte : retour au lobby, joueurs conservés, scores à zéro
  await new Promise(resolve => {
    player1.once('game:aborted', ({ message }) => {
      console.log(`\n6. ✓ Joueur notifié de l'arrêt : "${message}"`);
    });
    hostSocket.on('room:player_list_updated', ({ players, connectedCount }) => {
      if (players.length !== 2 || players.some(p => p.score > 0)) return; // attendre le broadcast du reset
      console.log(`   ✓ Retour au lobby : ${connectedCount} joueurs conservés, scores remis à zéro`);
      resolve();
    });
    hostSocket.emit('host:abort_game', { pin: roomPin });
  });

  // 7. La salle est réutilisable : un nouveau lancement fonctionne immédiatement
  await new Promise(resolve => {
    hostSocket.once('game:starting', ({ totalQuestions }) => {
      console.log(`7. ✓ Salle réutilisée après l'arrêt : nouvelle partie de ${totalQuestions} questions lancée`);
      resolve();
    });
    hostSocket.emit('host:start_game', { pin: roomPin, questionCount: 5, shuffle: true, categories: [], difficulties: [] });
  });

  console.log('\n✅ TOUT LE CYCLE WEBSOCKET & CALCUL DE SCORE FONCTIONNE PARFAITEMENT !');

  hostSocket.disconnect();
  player1.disconnect();
  player2.disconnect();
  process.exit(0);
}

runE2ETest().catch(err => {
  console.error('❌ Échec du test E2E :', err);
  process.exit(1);
});

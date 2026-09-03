const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();
const server = http.createServer(app);

// CORS configurable : CORS_ORIGIN='*' par défaut (pratique en LAN/dev où les
// joueurs arrivent de smartphones), à restreindre en prod via une liste
// d'origines séparées par des virgules (ex: CORS_ORIGIN="https://devarena.fr").
const rawCorsOrigin = process.env.CORS_ORIGIN || '*';
const corsOrigin = rawCorsOrigin === '*'
  ? '*'
  : rawCorsOrigin.split(',').map(o => o.trim()).filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Paramètres de nettoyage des salles en mémoire (surchargeable pour les tests)
const ROOM_SWEEP_INTERVAL_MS = parseInt(process.env.ROOM_SWEEP_INTERVAL_MS, 10) || 5 * 60 * 1000;
const ROOM_GAMEOVER_TTL_MS = parseInt(process.env.ROOM_GAMEOVER_TTL_MS, 10) || 30 * 60 * 1000;
const ROOM_IDLE_TTL_MS = parseInt(process.env.ROOM_IDLE_TTL_MS, 10) || 2 * 60 * 60 * 1000;

// Chargement des questions depuis questions.json (source de vérité pour le seed,
// et solution de repli si PostgreSQL est indisponible).
// QUESTIONS_FILE surchargeable pour les tests (copie de travail isolée).
const QUESTIONS_FILE = process.env.QUESTIONS_FILE || path.join(__dirname, 'questions.json');
let allQuestions = [];
try {
  const data = fs.readFileSync(QUESTIONS_FILE, 'utf8');
  allQuestions = JSON.parse(data);
  console.log(`[DevArena] ${allQuestions.length} questions chargées depuis questions.json.`);
} catch (err) {
  console.error('[DevArena] Erreur lors du chargement de questions.json:', err);
  allQuestions = [];
}

// Initialisation de PostgreSQL : schéma + seed des questions + rechargement depuis la base.
// En cas d'échec, l'application continue en mode fichier (questions.json).
let dbReady = false;
(async () => {
  try {
    await db.init();
    await db.seedQuestions(allQuestions);
    const dbQuestions = await db.loadQuestions();
    if (dbQuestions.length > 0) {
      allQuestions = dbQuestions;
    }
    dbReady = true;
    console.log(`[DevArena] PostgreSQL prêt : ${allQuestions.length} questions chargées depuis la base.`);
  } catch (err) {
    console.warn(`[DevArena] PostgreSQL indisponible (${err.message}). Mode fichier actif, aucune persistance.`);
  }
})();

// Middlewares
app.use(cors({ origin: corsOrigin }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Endpoints HTTP
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    activeRooms: Object.keys(rooms).length,
    totalQuestions: allQuestions.length,
    database: dbReady ? 'connected' : 'unavailable',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/scores/top', async (req, res) => {
  if (!dbReady) {
    res.status(503).json({ error: 'Base de données indisponible, pas de persistance des scores.' });
    return;
  }
  try {
    const limit = Math.min(50, parseInt(req.query.limit, 10) || 10);
    const topScores = await db.getTopScores(limit);
    res.json({ topScores });
  } catch (err) {
    console.error('[DB] Erreur lors de la lecture du top scores:', err.message);
    res.status(500).json({ error: 'Erreur lors de la lecture des scores.' });
  }
});

app.get('/api/questions/stats', (req, res) => {
  const categories = {};
  allQuestions.forEach(q => {
    categories[q.category] = (categories[q.category] || 0) + 1;
  });
  res.json({
    total: allQuestions.length,
    categories
  });
});

// ==========================================================================
// ÉDITEUR DE QUESTIONS — API admin protégée par token (header x-admin-token).
// questions.json reste la source de vérité : chaque écriture réécrit le
// fichier PUIS resynchronise PostgreSQL (upsert + delete ciblé).
// ==========================================================================
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

// timeLimit imposé par le niveau (même échelle que la banque existante)
const DIFFICULTY_TIME_LIMITS = {
  'Débutant': 20,
  'Intermédiaire': 25,
  'Avancé': 30,
  'Expert': 35
};
const VALID_DIFFICULTIES = Object.keys(DIFFICULTY_TIME_LIMITS);

function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) {
    res.status(503).json({ error: "Éditeur désactivé : définir la variable d'environnement ADMIN_TOKEN." });
    return;
  }
  if (req.get('x-admin-token') !== ADMIN_TOKEN) {
    res.status(401).json({ error: 'Token admin invalide.' });
    return;
  }
  next();
}

function validateQuestionPayload(body) {
  const errors = [];
  if (!body || typeof body !== 'object') return ['Payload JSON manquant.'];
  if (typeof body.category !== 'string' || !body.category.trim()) {
    errors.push('Catégorie requise.');
  }
  if (!VALID_DIFFICULTIES.includes(body.difficulty)) {
    errors.push(`Difficulté invalide (attendu : ${VALID_DIFFICULTIES.join(', ')}).`);
  }
  if (typeof body.question !== 'string' || body.question.trim().length < 10) {
    errors.push('Énoncé requis (10 caractères minimum).');
  }
  if (!Array.isArray(body.options) || body.options.length !== 4 ||
      body.options.some(o => typeof o !== 'string' || !o.trim())) {
    errors.push('Exactement 4 options non vides requises.');
  }
  if (!Number.isInteger(body.correctIndex) || body.correctIndex < 0 || body.correctIndex > 3) {
    errors.push('correctIndex doit être un entier entre 0 et 3.');
  }
  if (body.codeSnippet != null && typeof body.codeSnippet !== 'string') {
    errors.push('codeSnippet doit être une chaîne.');
  }
  if (body.explanation != null && typeof body.explanation !== 'string') {
    errors.push('explanation doit être une chaîne.');
  }
  return errors;
}

function buildQuestionFromPayload(body, id) {
  return {
    id,
    category: body.category.trim(),
    difficulty: body.difficulty,
    question: body.question.trim(),
    codeSnippet: (body.codeSnippet || '').trim() || null,
    options: body.options.map(o => o.trim()),
    correctIndex: body.correctIndex,
    timeLimit: DIFFICULTY_TIME_LIMITS[body.difficulty],
    explanation: (body.explanation || '').trim() || null
  };
}

// Réécrit questions.json puis resynchronise la base. Écriture directe (pas de
// temp+rename) pour rester compatible avec un bind mount Docker du fichier.
async function persistQuestions(deletedId = null) {
  fs.writeFileSync(QUESTIONS_FILE, JSON.stringify(allQuestions, null, 2) + '\n', 'utf8');
  if (dbReady) {
    try {
      if (deletedId !== null) await db.deleteQuestion(deletedId);
      await db.seedQuestions(allQuestions);
    } catch (err) {
      // Le fichier (source de vérité) est à jour ; la base se resynchronisera au prochain démarrage
      console.error('[Admin] Fichier écrit mais échec de synchro PostgreSQL :', err.message);
    }
  }
}

// Liste complète (avec correctIndex — réservée à l'admin, jamais envoyée aux joueurs)
app.get('/api/admin/questions', requireAdmin, (req, res) => {
  res.json({
    total: allQuestions.length,
    difficulties: VALID_DIFFICULTIES,
    questions: allQuestions
  });
});

app.post('/api/admin/questions', requireAdmin, async (req, res) => {
  const validationErrors = validateQuestionPayload(req.body);
  if (validationErrors.length > 0) {
    res.status(400).json({ error: validationErrors.join(' ') });
    return;
  }
  const nextId = allQuestions.reduce((max, q) => Math.max(max, q.id), 0) + 1;
  const question = buildQuestionFromPayload(req.body, nextId);
  allQuestions.push(question);
  try {
    await persistQuestions();
  } catch (err) {
    allQuestions.pop();
    console.error('[Admin] Échec d\'écriture de questions.json :', err.message);
    res.status(500).json({ error: 'Échec d\'écriture du fichier questions.json.' });
    return;
  }
  console.log(`[Admin] Question #${question.id} ajoutée (${question.category} / ${question.difficulty}).`);
  res.status(201).json({ question });
});

app.put('/api/admin/questions/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const index = allQuestions.findIndex(q => q.id === id);
  if (index === -1) {
    res.status(404).json({ error: `Question #${id} introuvable.` });
    return;
  }
  const validationErrors = validateQuestionPayload(req.body);
  if (validationErrors.length > 0) {
    res.status(400).json({ error: validationErrors.join(' ') });
    return;
  }
  const previous = allQuestions[index];
  allQuestions[index] = buildQuestionFromPayload(req.body, id);
  try {
    await persistQuestions();
  } catch (err) {
    allQuestions[index] = previous;
    console.error('[Admin] Échec d\'écriture de questions.json :', err.message);
    res.status(500).json({ error: 'Échec d\'écriture du fichier questions.json.' });
    return;
  }
  console.log(`[Admin] Question #${id} modifiée.`);
  res.json({ question: allQuestions[index] });
});

app.delete('/api/admin/questions/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const index = allQuestions.findIndex(q => q.id === id);
  if (index === -1) {
    res.status(404).json({ error: `Question #${id} introuvable.` });
    return;
  }
  const [removed] = allQuestions.splice(index, 1);
  try {
    await persistQuestions(id);
  } catch (err) {
    allQuestions.splice(index, 0, removed);
    console.error('[Admin] Échec d\'écriture de questions.json :', err.message);
    res.status(500).json({ error: 'Échec d\'écriture du fichier questions.json.' });
    return;
  }
  console.log(`[Admin] Question #${id} supprimée (${removed.category}).`);
  res.json({ deleted: id, total: allQuestions.length });
});

// État en mémoire vive (RAM)
const rooms = {};

// Helper: Générer un code PIN à 6 chiffres réellement unique.
// Retourne null si l'espace des PIN est saturé (cas quasi impossible : 900 000 combinaisons).
function generateRoomPin() {
  // Garde-fou : si plus de 90% des PIN sont pris, on refuse plutôt que de boucler à l'infini
  if (Object.keys(rooms).length >= 810000) {
    return null;
  }
  let pin;
  do {
    pin = Math.floor(100000 + Math.random() * 900000).toString();
  } while (rooms[pin]);
  return pin;
}

// Helper: Mélanger un tableau (Fisher-Yates)
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Helper: Catalogue des questions disponibles { catégorie: { difficulté: nombre } }
function getQuestionCatalog() {
  const matrix = {};
  allQuestions.forEach(q => {
    const cat = q.category || 'Autre';
    const diff = q.difficulty || 'Normal';
    if (!matrix[cat]) matrix[cat] = {};
    matrix[cat][diff] = (matrix[cat][diff] || 0) + 1;
  });
  return matrix;
}

// Helper: Filtrer la banque selon les catégories et niveaux choisis (tableaux vides = tout)
function filterQuestions(categories, difficulties) {
  let pool = allQuestions;
  if (Array.isArray(categories) && categories.length > 0) {
    pool = pool.filter(q => categories.includes(q.category));
  }
  if (Array.isArray(difficulties) && difficulties.length > 0) {
    pool = pool.filter(q => difficulties.includes(q.difficulty));
  }
  return pool;
}

// ==========================================================================
// SYSTÈME DE JOKERS - Jauge d'énergie ⚡ et arsenal de l'arène
// ==========================================================================

const ENERGY_MAX = 100;

const JOKERS = {
  fifty: {
    id: 'fifty', name: '--fifty', icon: '🎯', type: 'defensive', cost: 30,
    desc: 'Élimine 2 mauvaises réponses de ton écran.'
  },
  shield: {
    id: 'shield', name: 'try/catch', icon: '🛡️', type: 'defensive', cost: 40,
    desc: 'Ta série 🔥 survit même si tu réponds faux à cette question.'
  },
  boost: {
    id: 'boost', name: 'sudo boost', icon: '🚀', type: 'defensive', cost: 45,
    desc: 'Ta réponse à cette question vaut le double de points.'
  },
  ddos: {
    id: 'ddos', name: 'DDoS.sh', icon: '💥', type: 'offensive', cost: 25,
    desc: 'Fait glitcher l\'écran du joueur au-dessus de toi pendant 4s.'
  },
  rot13: {
    id: 'rot13', name: 'rot13 --attack', icon: '🕵️', type: 'offensive', cost: 35,
    desc: 'Chiffre les réponses du joueur au-dessus de toi pendant 5s.'
  },
  steal: {
    id: 'steal', name: 'exploit --steal', icon: '💰', type: 'offensive', cost: 60,
    desc: 'Vole immédiatement 10% des points du joueur au-dessus de toi.'
  }
};

// Gain d'énergie sur bonne réponse : 10 ⚡ × multiplicateur de streak (plafonné à x3)
function energyGain(streak) {
  const multiplier = Math.min(3, 1 + 0.5 * (streak - 1));
  return Math.round(10 * multiplier);
}

// Cible d'une attaque : le joueur connecté juste au-dessus de l'attaquant au
// classement (mécanisme de remontée). Le n°1 attaque le n°2.
function pickTarget(room, attackerId) {
  const ranking = getConnectedPlayers(room).sort((a, b) => b.score - a.score);
  if (ranking.length < 2) return null;
  const idx = ranking.findIndex(p => p.id === attackerId);
  if (idx === -1) return null;
  return idx === 0 ? ranking[1] : ranking[idx - 1];
}

// Helper: Marquer une salle comme active (pour le nettoyage des salles abandonnées)
function touchRoom(pin) {
  const room = rooms[pin];
  if (room) room.lastActivity = Date.now();
}

// Helper: Joueurs actuellement connectés d'une salle
function getConnectedPlayers(room) {
  return Object.values(room.players).filter(p => p.connected !== false);
}

// Helper: Diffuser la liste des joueurs (avec état de connexion) à toute la salle
function broadcastPlayerList(pin) {
  const room = rooms[pin];
  if (!room) return;
  room.lastActivity = Date.now();
  const playerList = Object.values(room.players).map(p => ({
    id: p.id,
    nickname: p.nickname,
    avatarIndex: p.avatarIndex,
    score: p.score,
    connected: p.connected !== false
  }));
  io.to(`room:${pin}`).emit('room:player_list_updated', {
    players: playerList,
    count: playerList.length,
    connectedCount: playerList.filter(p => p.connected).length
  });
}

// Délai de grâce avant fermeture d'une salle dont l'hôte s'est déconnecté
// (permet un rechargement de page ou une micro-coupure sans détruire la partie)
const HOST_GRACE_MS = 45000;

// Constructeur du classement (utilisé pour les résultats de manche et la resync hôte)
function buildLeaderboard(room) {
  return Object.values(room.players)
    .sort((a, b) => b.score - a.score)
    .map((p, idx) => ({
      rank: idx + 1,
      id: p.id,
      nickname: p.nickname,
      score: p.score,
      lastPoints: p.lastPoints,
      streak: p.streak,
      avatarIndex: p.avatarIndex
    }));
}

// Payload de fin de manche (réémis tel quel à l'hôte lors d'une reconnexion)
function buildRoundEndedPayload(room) {
  const currentQ = room.questions[room.currentQuestionIndex];
  const optionStats = [0, 0, 0, 0];
  Object.values(room.answers).forEach(ans => {
    if (ans.answerIndex >= 0 && ans.answerIndex < 4) optionStats[ans.answerIndex]++;
  });
  const leaderboard = buildLeaderboard(room);
  return {
    correctIndex: currentQ.correctIndex,
    explanation: currentQ.explanation,
    optionStats,
    leaderboard: leaderboard.slice(0, 5),
    fullLeaderboard: leaderboard,
    isLastQuestion: room.currentQuestionIndex >= room.questions.length - 1
  };
}

// Payload de fin de partie (podium)
function buildGameOverPayload(room) {
  const finalRanking = Object.values(room.players)
    .sort((a, b) => b.score - a.score)
    .map((p, idx) => ({
      rank: idx + 1,
      id: p.id,
      nickname: p.nickname,
      score: p.score,
      totalCorrect: p.totalCorrect,
      totalQuestions: room.questions.length,
      avatarIndex: p.avatarIndex,
      accuracy: Math.round((p.totalCorrect / Math.max(1, room.questions.length)) * 100)
    }));
  return {
    podium: finalRanking.slice(0, 3),
    fullRanking: finalRanking,
    totalQuestions: room.questions.length,
    finalRanking
  };
}

// Gestion des WebSockets
io.on('connection', (socket) => {
  console.log(`[Socket] Connexion établie: ${socket.id}`);

  // --- 1. CRÉATION D'UNE SALLE PAR L'HÔTE ---
  socket.on('host:create_room', () => {
    const pin = generateRoomPin();
    if (!pin) {
      socket.emit('error_message', { message: 'Le serveur est saturé, réessayez dans un instant.' });
      return;
    }
    rooms[pin] = {
      pin,
      hostSocketId: socket.id,
      hostConnected: true,
      hostGraceTimer: null,
      lastActivity: Date.now(),
      state: 'LOBBY', // LOBBY, QUESTION, ROUND_RESULT, GAME_OVER
      players: {}, // socketId -> { id, nickname, score, streak, totalCorrect, lastPoints }
      questions: [],
      currentQuestionIndex: -1,
      questionStartTime: null,
      questionTimeLimit: 20,
      answers: {}, // socketId -> { answerIndex, timeTakenMs, points, isCorrect }
      timer: null,
      tickInterval: null,
      settings: {
        questionCount: Math.min(10, allQuestions.length),
        shuffle: true
      }
    };

    socket.join(`room:${pin}`);
    socket.join(`host:${pin}`);

    console.log(`[Room ${pin}] Salle créée par l'hôte ${socket.id}`);
    socket.emit('host:room_created', {
      pin,
      totalQuestionsAvailable: allQuestions.length,
      catalog: getQuestionCatalog()
    });
  });

  // --- 1bis. RECONNEXION DE L'HÔTE (rechargement de page / micro-coupure) ---
  socket.on('host:reconnect', ({ pin }) => {
    const cleanPin = (pin || '').toString().trim();
    const room = rooms[cleanPin];

    if (!room) {
      // Salle expirée ou fermée : le client créera une nouvelle salle
      socket.emit('host:reconnect_failed');
      return;
    }

    // Annuler le délai de grâce et réassocier le socket de l'hôte
    if (room.hostGraceTimer) {
      clearTimeout(room.hostGraceTimer);
      room.hostGraceTimer = null;
    }
    room.hostSocketId = socket.id;
    room.hostConnected = true;
    socket.join(`room:${cleanPin}`);
    socket.join(`host:${cleanPin}`);

    console.log(`[Room ${cleanPin}] Hôte reconnecté (${socket.id}), reprise à l'état ${room.state}.`);

    // Rétablir le contexte de la salle côté hôte
    socket.emit('host:reconnected', {
      pin: cleanPin,
      totalQuestionsAvailable: allQuestions.length,
      catalog: getQuestionCatalog(),
      state: room.state
    });
    broadcastPlayerList(cleanPin);

    // Resynchroniser la vue de jeu en cours
    if (room.state === 'QUESTION') {
      const currentQ = room.questions[room.currentQuestionIndex];
      const elapsedSec = Math.floor((Date.now() - room.questionStartTime) / 1000);
      socket.emit('game:question_started', {
        questionNumber: room.currentQuestionIndex + 1,
        totalQuestions: room.questions.length,
        category: currentQ.category,
        difficulty: currentQ.difficulty,
        question: currentQ.question,
        codeSnippet: currentQ.codeSnippet,
        options: currentQ.options,
        timeLimit: room.questionTimeLimit,
        remainingSec: Math.max(0, room.questionTimeLimit - elapsedSec)
      });
      const connected = getConnectedPlayers(room);
      socket.emit('host:player_answered_count', {
        answeredCount: connected.filter(p => room.answers[p.id] !== undefined).length,
        totalPlayers: connected.length
      });
    } else if (room.state === 'ROUND_RESULT') {
      socket.emit('game:round_ended', buildRoundEndedPayload(room));
    } else if (room.state === 'GAME_OVER') {
      socket.emit('game:game_over', buildGameOverPayload(room));
    }

    // Informer les joueurs que le Maître du jeu est de retour
    io.to(`room:${cleanPin}`).emit('game:host_resumed');
  });

  // --- 2. REJOINDRE UNE SALLE (JOUEUR) ---
  socket.on('player:join_room', ({ pin, nickname }) => {
    const cleanPin = (pin || '').trim();
    const cleanNickname = (nickname || '').trim().substring(0, 16);

    const room = rooms[cleanPin];
    if (!room) {
      socket.emit('player:join_error', { message: 'Code PIN introuvable. Vérifiez le code affiché par le Host.' });
      return;
    }

    if (!cleanNickname) {
      socket.emit('player:join_error', { message: 'Veuillez saisir un pseudo valide.' });
      return;
    }

    if (room.state !== 'LOBBY') {
      // --- TENTATIVE DE RECONNEXION EN COURS DE PARTIE ---
      if (room.state === 'GAME_OVER') {
        socket.emit('player:join_error', { message: 'Cette partie est terminée. Demandez un nouveau PIN au Maître du jeu.' });
        return;
      }

      const oldId = Object.keys(room.players).find(id =>
        room.players[id].connected === false &&
        room.players[id].nickname.toLowerCase() === cleanNickname.toLowerCase()
      );

      if (!oldId) {
        socket.emit('player:join_error', {
          message: 'La partie est déjà en cours. (Si tu étais dans la partie, reconnecte-toi avec exactement le même pseudo.)'
        });
        return;
      }

      // Réassociation du joueur à son nouveau socket : score et série conservés
      const playerData = room.players[oldId];
      delete room.players[oldId];
      playerData.id = socket.id;
      playerData.connected = true;
      room.players[socket.id] = playerData;
      if (room.answers[oldId] !== undefined) {
        room.answers[socket.id] = room.answers[oldId];
        delete room.answers[oldId];
      }

      socket.join(`room:${cleanPin}`);
      socket.data.roomPin = cleanPin;
      socket.data.nickname = playerData.nickname;

      console.log(`[Room ${cleanPin}] Reconnexion de "${playerData.nickname}" (score conservé : ${playerData.score} pts).`);

      socket.emit('player:join_success', {
        pin: cleanPin,
        player: playerData,
        resumed: true,
        state: room.state,
        jokers: Object.values(JOKERS),
        energyMax: ENERGY_MAX
      });

      // Renvoyer la question en cours pour reprendre la partie immédiatement
      if (room.state === 'QUESTION') {
        const currentQ = room.questions[room.currentQuestionIndex];
        const elapsedSec = Math.floor((Date.now() - room.questionStartTime) / 1000);
        socket.emit('game:question_started', {
          questionNumber: room.currentQuestionIndex + 1,
          totalQuestions: room.questions.length,
          category: currentQ.category,
          difficulty: currentQ.difficulty,
          question: currentQ.question,
          codeSnippet: currentQ.codeSnippet,
          options: currentQ.options,
          timeLimit: room.questionTimeLimit,
          remainingSec: Math.max(0, room.questionTimeLimit - elapsedSec),
          alreadyAnswered: room.answers[socket.id] !== undefined
        });
      }

      broadcastPlayerList(cleanPin);
      return;
    }

    // Vérification de doublon de pseudo
    const nicknameExists = Object.values(room.players).some(
      p => p.nickname.toLowerCase() === cleanNickname.toLowerCase()
    );
    if (nicknameExists) {
      socket.emit('player:join_error', { message: 'Ce pseudo est déjà utilisé dans cette arène. Choisissez-en un autre !' });
      return;
    }

    // Enregistrement du joueur
    room.players[socket.id] = {
      id: socket.id,
      nickname: cleanNickname,
      score: 0,
      streak: 0,
      totalCorrect: 0,
      lastPoints: 0,
      avatarIndex: Math.floor(Math.random() * 8),
      connected: true,
      energy: 0,
      jokersUsed: { defensive: false, offensive: false },
      shieldActive: false,
      boostActive: false,
      attackedUntil: {}
    };

    socket.join(`room:${cleanPin}`);
    socket.data.roomPin = cleanPin;
    socket.data.nickname = cleanNickname;

    console.log(`[Room ${cleanPin}] Joueur "${cleanNickname}" (${socket.id}) a rejoint.`);

    // Confirmer au joueur
    socket.emit('player:join_success', {
      pin: cleanPin,
      player: room.players[socket.id],
      jokers: Object.values(JOKERS),
      energyMax: ENERGY_MAX
    });

    // Mettre à jour la liste des joueurs pour l'hôte et la salle
    broadcastPlayerList(cleanPin);
  });

  // --- 3. DÉMARRAGE DU JEU PAR L'HÔTE ---
  socket.on('host:start_game', ({ pin, questionCount = 10, shuffle = true, categories = [], difficulties = [] }) => {
    const cleanPin = (pin || '').toString().trim();
    const room = rooms[cleanPin];
    
    if (!room) {
      console.log(`[Host Error] Salle "${cleanPin}" non trouvée lors de la tentative de démarrage.`);
      socket.emit('error_message', { message: 'Salle introuvable ou expirée. Veuillez recharger la page.' });
      return;
    }

    // Réassociation automatique du socket de l'hôte si reconnexion
    if (room.hostSocketId !== socket.id) {
      console.log(`[Room ${cleanPin}] Réassociation de l'hôte ${socket.id} (ancien: ${room.hostSocketId})`);
      room.hostSocketId = socket.id;
      socket.join(`room:${cleanPin}`);
      socket.join(`host:${cleanPin}`);
    }

    const playerCount = Object.keys(room.players).length;
    if (playerCount === 0) {
      socket.emit('error_message', { 
        message: '⚠️ Aucun joueur n\'a encore rejoint cette arène ! Rejoignez depuis /player.html avec le code PIN ' + cleanPin + ' pour démarrer.' 
      });
      return;
    }

    // Filtrage par catégories et niveaux choisis par l'hôte (vide = tout)
    const filteredPool = filterQuestions(categories, difficulties);
    if (filteredPool.length === 0) {
      socket.emit('error_message', {
        message: '⚠️ Aucune question ne correspond aux filtres choisis. Élargissez la sélection de catégories ou de niveaux.'
      });
      return;
    }

    // Préparation de la liste des questions
    let selectedQuestions = shuffle ? shuffleArray(filteredPool) : [...filteredPool];
    const count = Math.min(parseInt(questionCount, 10) || 10, selectedQuestions.length);
    room.questions = selectedQuestions.slice(0, count);
    room.currentQuestionIndex = -1;
    room.state = 'STARTING';

    const filterInfo = [
      categories.length > 0 ? `catégories: ${categories.join(', ')}` : 'toutes catégories',
      difficulties.length > 0 ? `niveaux: ${difficulties.join(', ')}` : 'tous niveaux'
    ].join(' | ');
    console.log(`[Room ${cleanPin}] Démarrage: ${room.questions.length} questions (${filterInfo}) et ${playerCount} joueurs.`);

    io.to(`room:${cleanPin}`).emit('game:starting', {
      totalQuestions: room.questions.length,
      countdown: 3
    });

    setTimeout(() => {
      startNextQuestion(cleanPin);
    }, 3500);
  });

  // --- 4. RÉPONSE D'UN JOUEUR ---
  socket.on('player:submit_answer', ({ pin, answerIndex }) => {
    const room = rooms[pin];
    if (!room || room.state !== 'QUESTION') {
      return;
    }

    const player = room.players[socket.id];
    if (!player) return;

    // Si déjà répondu pour cette question, ignorer (anti-triche / anti-spam)
    if (room.answers[socket.id] !== undefined) {
      return;
    }

    const now = Date.now();
    const timeTakenMs = Math.max(50, now - room.questionStartTime);
    const maxTimeMs = room.questionTimeLimit * 1000;
    const currentQ = room.questions[room.currentQuestionIndex];

    const isCorrect = answerIndex === currentQ.correctIndex;
    let points = 0;

    if (isCorrect) {
      // Formule Kahoot! optimisée : 1000 * (1 - (temps / temps_max)) avec plancher à 150 pts
      const timeRatio = Math.min(1, Math.max(0, timeTakenMs / maxTimeMs));
      const basePoints = Math.round(1000 * (1 - timeRatio));

      // Bonus de streak (+50 pts par bonne réponse consécutive après la première, max 250)
      const streakBonus = player.streak > 0 ? Math.min(250, player.streak * 50) : 0;
      points = Math.max(150, basePoints) + streakBonus;

      // Joker sudo boost : la réponse vaut le double
      if (player.boostActive) {
        points *= 2;
      }

      player.streak += 1;
      player.totalCorrect += 1;

      // Gain d'énergie ⚡ : 10 × multiplicateur de streak (plafonné à x3, jauge max 100)
      player.energy = Math.min(ENERGY_MAX, player.energy + energyGain(player.streak));
    } else {
      // Joker try/catch : la série survit à une mauvaise réponse
      if (!player.shieldActive) {
        player.streak = 0;
      }
      points = 0;
    }

    // Les effets boost et bouclier sont consommés par la réponse
    player.boostActive = false;
    player.shieldActive = false;

    player.score += points;
    player.lastPoints = points;

    room.answers[socket.id] = {
      answerIndex,
      timeTakenMs,
      points,
      isCorrect
    };

    // Accusé de réception immédiat au joueur
    socket.emit('player:answer_acknowledged', {
      answerIndex,
      receivedAt: now
    });

    const connectedPlayers = getConnectedPlayers(room);
    const answeredCount = connectedPlayers.filter(p => room.answers[p.id] !== undefined).length;
    const totalPlayers = connectedPlayers.length;

    // Mise à jour du compteur pour l'hôte
    io.to(`host:${pin}`).emit('host:player_answered_count', {
      answeredCount,
      totalPlayers
    });

    // Si tous les joueurs connectés ont répondu, fin immédiate de la question
    if (answeredCount >= totalPlayers && totalPlayers > 0) {
      console.log(`[Room ${pin}] Tous les joueurs connectés (${answeredCount}/${totalPlayers}) ont répondu. Clôture anticipée.`);
      endQuestionRound(pin);
    }
  });

  // --- 4bis. UTILISATION D'UN JOKER PAR UN JOUEUR ---
  socket.on('player:use_joker', ({ pin, jokerId }) => {
    const room = rooms[pin];
    const fail = (message) => socket.emit('joker:error', { message });

    if (!room || room.state !== 'QUESTION') {
      return fail('Les jokers ne s\'utilisent que pendant une question.');
    }
    const player = room.players[socket.id];
    if (!player) return;

    const joker = JOKERS[jokerId];
    if (!joker) return fail('Joker inconnu.');

    if (room.answers[socket.id] !== undefined) {
      return fail('Trop tard : tu as déjà répondu à cette question.');
    }
    if (player.jokersUsed[joker.type]) {
      return fail(`Tu as déjà utilisé un joker ${joker.type === 'defensive' ? 'défensif' : 'offensif'} sur cette question.`);
    }
    if (player.energy < joker.cost) {
      return fail(`Énergie insuffisante : il te faut ${joker.cost} ⚡ (tu en as ${player.energy}).`);
    }

    let targetNickname = null;
    let stolenAmount = 0;

    if (joker.type === 'offensive') {
      const target = pickTarget(room, socket.id);
      if (!target) {
        return fail('Aucun adversaire connecté à attaquer.');
      }

      if (jokerId === 'ddos' || jokerId === 'rot13') {
        const now = Date.now();
        const duration = jokerId === 'ddos' ? 4000 : 5000;
        target.attackedUntil = target.attackedUntil || {};
        if ((target.attackedUntil[jokerId] || 0) > now) {
          return fail('Ta cible est déjà sous cette attaque !');
        }
        target.attackedUntil[jokerId] = now + duration;
        io.to(target.id).emit('joker:attacked', {
          type: jokerId,
          from: player.nickname,
          duration
        });
      } else if (jokerId === 'steal') {
        stolenAmount = Math.floor(target.score * 0.10);
        if (stolenAmount <= 0) {
          return fail('Ta cible n\'a pas assez de points à voler.');
        }
        target.score -= stolenAmount;
        player.score += stolenAmount;
        io.to(target.id).emit('joker:attacked', {
          type: 'steal',
          from: player.nickname,
          amount: stolenAmount
        });
      }
      targetNickname = target.nickname;
    } else {
      // Jokers défensifs
      if (jokerId === 'fifty') {
        const currentQ = room.questions[room.currentQuestionIndex];
        const wrongIndexes = [0, 1, 2, 3].filter(i => i !== currentQ.correctIndex);
        const removedIndexes = shuffleArray(wrongIndexes).slice(0, 2);
        socket.emit('joker:fifty_result', { removedIndexes });
      } else if (jokerId === 'shield') {
        player.shieldActive = true;
      } else if (jokerId === 'boost') {
        player.boostActive = true;
      }
    }

    // Débit de l'énergie et verrou par type pour cette question
    player.energy -= joker.cost;
    player.jokersUsed[joker.type] = true;

    console.log(`[Room ${pin}] ⚔️ ${player.nickname} utilise ${joker.name}${targetNickname ? ` sur ${targetNickname}` : ''} (reste ${player.energy} ⚡).`);

    socket.emit('joker:use_ack', {
      jokerId,
      energy: player.energy,
      scoreAfter: player.score,
      stolenAmount,
      target: targetNickname
    });

    // Fil d'événements sur l'écran du Maître du jeu
    io.to(`host:${pin}`).emit('host:joker_event', {
      from: player.nickname,
      jokerId,
      jokerName: joker.name,
      icon: joker.icon,
      target: targetNickname
    });
  });

  // --- 5. PASSAGE À LA QUESTION SUIVANTE PAR L'HÔTE ---
  socket.on('host:next_question', ({ pin }) => {
    const room = rooms[pin];
    if (!room || room.hostSocketId !== socket.id) return;
    if (room.state === 'ROUND_RESULT') {
      startNextQuestion(pin);
    }
  });

  // --- 6. GESTION DES DÉCONNEXIONS ---
  socket.on('disconnect', () => {
    console.log(`[Socket] Déconnexion: ${socket.id}`);
    
    // Si c'est un hôte
    for (const pin in rooms) {
      const room = rooms[pin];
      if (room.hostSocketId === socket.id) {
        // Délai de grâce : la partie continue, l'hôte peut se reconnecter (refresh, coupure)
        console.log(`[Room ${pin}] Hôte déconnecté — période de grâce de ${HOST_GRACE_MS / 1000}s avant fermeture.`);
        room.hostConnected = false;
        io.to(`room:${pin}`).emit('game:host_paused', {
          message: "Le Maître du jeu s'est déconnecté... reconnexion en cours."
        });

        if (room.hostGraceTimer) clearTimeout(room.hostGraceTimer);
        room.hostGraceTimer = setTimeout(() => {
          console.log(`[Room ${pin}] Délai de grâce écoulé, l'hôte n'est pas revenu. Fermeture de la salle.`);
          clearInterval(room.tickInterval);
          clearTimeout(room.timer);
          io.to(`room:${pin}`).emit('game:host_disconnected', {
            message: "L'arène a été fermée : le Maître du jeu ne s'est pas reconnecté à temps."
          });
          delete rooms[pin];
        }, HOST_GRACE_MS);
        return;
      }
      
      // Si c'est un joueur
      if (room.players[socket.id]) {
        const pName = room.players[socket.id].nickname;

        if (room.state === 'LOBBY' || room.state === 'GAME_OVER') {
          // Hors partie : suppression définitive
          console.log(`[Room ${pin}] Joueur "${pName}" déconnecté (retiré du lobby).`);
          delete room.players[socket.id];
          delete room.answers[socket.id];
        } else {
          // En pleine partie : on conserve le joueur pour permettre la reconnexion
          console.log(`[Room ${pin}] Joueur "${pName}" déconnecté en cours de partie (score conservé, reconnexion possible).`);
          room.players[socket.id].connected = false;
        }

        broadcastPlayerList(pin);

        // Si on était en question et qu'avec ce départ tous les connectés restants ont répondu
        if (room.state === 'QUESTION') {
          const connectedPlayers = getConnectedPlayers(room);
          const answeredCount = connectedPlayers.filter(p => room.answers[p.id] !== undefined).length;
          io.to(`host:${pin}`).emit('host:player_answered_count', {
            answeredCount,
            totalPlayers: connectedPlayers.length
          });
          if (connectedPlayers.length > 0 && answeredCount >= connectedPlayers.length) {
            endQuestionRound(pin);
          }
        }
      }
    }
  });
});

// Helper: Lancement d'une question
function startNextQuestion(pin) {
  const room = rooms[pin];
  if (!room) return;
  room.lastActivity = Date.now();

  clearInterval(room.tickInterval);
  clearTimeout(room.timer);

  room.currentQuestionIndex++;

  if (room.currentQuestionIndex >= room.questions.length) {
    // Fin de la partie
    finishGame(pin);
    return;
  }

  const currentQ = room.questions[room.currentQuestionIndex];
  room.state = 'QUESTION';
  room.answers = {};
  room.questionTimeLimit = currentQ.timeLimit || 20;
  room.questionStartTime = Date.now();

  // Réinitialisation des jokers pour la nouvelle question (1 défensif + 1 offensif max)
  Object.values(room.players).forEach(p => {
    p.jokersUsed = { defensive: false, offensive: false };
    p.shieldActive = false;
    p.boostActive = false;
  });

  // Payload diffusé aux clients (SANS la bonne réponse ni l'explication pour éviter la triche)
  const clientQuestionPayload = {
    questionNumber: room.currentQuestionIndex + 1,
    totalQuestions: room.questions.length,
    category: currentQ.category,
    difficulty: currentQ.difficulty,
    question: currentQ.question,
    codeSnippet: currentQ.codeSnippet,
    options: currentQ.options,
    timeLimit: room.questionTimeLimit
  };

  io.to(`room:${pin}`).emit('game:question_started', clientQuestionPayload);
  io.to(`host:${pin}`).emit('host:player_answered_count', {
    answeredCount: 0,
    totalPlayers: getConnectedPlayers(room).length
  });

  // Ticks de synchronisation du timer
  let remainingSec = room.questionTimeLimit;
  room.tickInterval = setInterval(() => {
    remainingSec--;
    if (remainingSec >= 0) {
      io.to(`room:${pin}`).emit('game:timer_tick', { remainingSec });
    }
    if (remainingSec <= 0) {
      clearInterval(room.tickInterval);
    }
  }, 1000);

  // Minuteur de fin de question
  room.timer = setTimeout(() => {
    endQuestionRound(pin);
  }, room.questionTimeLimit * 1000 + 300); // 300ms de marge de sécurité réseau
}

// Helper: Fin de la question en cours et calcul des résultats
function endQuestionRound(pin) {
  const room = rooms[pin];
  if (!room || room.state !== 'QUESTION') return;
  room.lastActivity = Date.now();

  clearInterval(room.tickInterval);
  clearTimeout(room.timer);

  room.state = 'ROUND_RESULT';
  const currentQ = room.questions[room.currentQuestionIndex];
  const leaderboard = buildLeaderboard(room);

  // Notifier chaque joueur individuellement avec son résultat personnalisé
  Object.values(room.players).forEach(player => {
    const playerAnswer = room.answers[player.id];
    const isCorrect = playerAnswer ? playerAnswer.isCorrect : false;
    const pointsGained = playerAnswer ? playerAnswer.points : 0;
    const currentRankObj = leaderboard.find(l => l.id === player.id);
    const rank = currentRankObj ? currentRankObj.rank : 1;

    io.to(player.id).emit('player:round_result', {
      isCorrect,
      hasAnswered: !!playerAnswer,
      pointsGained,
      currentScore: player.score,
      rank,
      streak: player.streak,
      energy: player.energy,
      correctIndex: currentQ.correctIndex,
      correctOptionLetter: ['A', 'B', 'C', 'D'][currentQ.correctIndex],
      correctAnswerText: currentQ.options[currentQ.correctIndex],
      explanation: currentQ.explanation
    });
  });

  // Notifier toute la salle avec la révélation et le classement
  io.to(`room:${pin}`).emit('game:round_ended', buildRoundEndedPayload(room));
}

// Helper: Fin définitive de la partie et podium
function finishGame(pin) {
  const room = rooms[pin];
  if (!room) return;

  room.state = 'GAME_OVER';

  const payload = buildGameOverPayload(room);
  const finalRanking = payload.finalRanking;

  console.log(`[Room ${pin}] Partie terminée ! Vainqueur: ${finalRanking[0]?.nickname || 'Aucun'} avec ${finalRanking[0]?.score || 0} pts.`);

  // Persistance du résultat en base (sans bloquer la fin de partie côté joueurs)
  if (dbReady && finalRanking.length > 0) {
    db.saveGameResults(pin, finalRanking, room.questions.length)
      .then(gameId => console.log(`[DB] Partie ${pin} enregistrée (id=${gameId}).`))
      .catch(err => console.error(`[DB] Échec de l'enregistrement de la partie ${pin}:`, err.message));
  }

  io.to(`room:${pin}`).emit('game:game_over', payload);
}

// Nettoyage périodique des salles abandonnées (évite la fuite mémoire) :
// - salle terminée (GAME_OVER) inactive depuis ROOM_GAMEOVER_TTL_MS
// - toute salle inactive depuis ROOM_IDLE_TTL_MS (hôte parti, partie oubliée...)
function sweepRooms() {
  const now = Date.now();
  let removed = 0;
  for (const pin in rooms) {
    const room = rooms[pin];
    const idleFor = now - (room.lastActivity || 0);
    const ttl = room.state === 'GAME_OVER' ? ROOM_GAMEOVER_TTL_MS : ROOM_IDLE_TTL_MS;
    if (idleFor > ttl) {
      clearInterval(room.tickInterval);
      clearTimeout(room.timer);
      clearTimeout(room.hostGraceTimer);
      io.to(`room:${pin}`).emit('game:host_disconnected', {
        message: "L'arène a été fermée pour inactivité."
      });
      delete rooms[pin];
      removed++;
    }
  }
  if (removed > 0) {
    console.log(`[Cleanup] ${removed} salle(s) inactive(s) supprimée(s). Restantes : ${Object.keys(rooms).length}.`);
  }
}
const roomSweepInterval = setInterval(sweepRooms, ROOM_SWEEP_INTERVAL_MS);
roomSweepInterval.unref?.(); // ne pas empêcher l'arrêt du process

// Démarrage du serveur HTTP & WebSocket
server.listen(PORT, () => {
  console.log('====================================================');
  console.log(`🚀 [DevArena] Serveur opérationnel sur le port ${PORT}`);
  console.log(`🌐 Accès Web : http://localhost:${PORT}`);
  console.log(`🎮 Mode Host  : http://localhost:${PORT}/host.html`);
  console.log(`📱 Mode Player: http://localhost:${PORT}/player.html`);
  console.log('====================================================');
});

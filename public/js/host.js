// ==========================================================================
// DEVARENA - HOST CONTROLLER (Écran Maître du Jeu)
// ==========================================================================

const socket = io();

// Éléments du DOM
const views = {
  lobby: document.getElementById('view-lobby'),
  countdown: document.getElementById('view-countdown'),
  question: document.getElementById('view-question'),
  result: document.getElementById('view-result'),
  podium: document.getElementById('view-podium')
};

const pinDisplay = document.getElementById('room-pin-display');
const playerCountBadge = document.getElementById('player-count-badge');
const playerGrid = document.getElementById('player-lobby-grid');
const startBtn = document.getElementById('btn-start-game');
const questionCountSelect = document.getElementById('select-question-count');

// Question View elements
const qCategoryBadge = document.getElementById('q-category-badge');
const qDifficultyBadge = document.getElementById('q-difficulty-badge');
const qProgressText = document.getElementById('q-progress-text');
const qText = document.getElementById('q-text');
const qCodeBox = document.getElementById('q-code-box');
const qAnswerA = document.getElementById('host-ans-a');
const qAnswerB = document.getElementById('host-ans-b');
const qAnswerC = document.getElementById('host-ans-c');
const qAnswerD = document.getElementById('host-ans-d');
const hostAnswerButtons = [qAnswerA, qAnswerB, qAnswerC, qAnswerD];

const answeredCounter = document.getElementById('answered-counter-text');
const timerText = document.getElementById('host-timer-text');
const timerCircle = document.getElementById('host-timer-progress');
const circumference = 2 * Math.PI * 28; // r=28 => ~175.92

// Result View elements
const resExplanation = document.getElementById('result-explanation');
const resLeaderboardList = document.getElementById('result-leaderboard-list');
const btnNextQuestion = document.getElementById('btn-next-question');

// Podium View elements
const podiumContainer = document.getElementById('podium-steps-container');
const finalLeaderboardList = document.getElementById('final-leaderboard-list');
const btnRestart = document.getElementById('btn-restart-game');

let currentRoomPin = null;
let currentMaxTime = 20;

// --- Filtres catégories & niveaux ---
const DIFFICULTY_ORDER = ['Débutant', 'Intermédiaire', 'Avancé', 'Expert'];
const categoryChipsContainer = document.getElementById('category-filter-chips');
const difficultyChipsContainer = document.getElementById('difficulty-filter-chips');
const filterCountDisplay = document.getElementById('filter-question-count');

let questionCatalog = {};            // { catégorie: { difficulté: nombre } }
const selectedCategories = new Set();   // vide = toutes
const selectedDifficulties = new Set(); // vide = tous

// Nombre de questions correspondant aux filtres actuels
function countMatchingQuestions() {
  let total = 0;
  Object.keys(questionCatalog).forEach(cat => {
    if (selectedCategories.size > 0 && !selectedCategories.has(cat)) return;
    Object.keys(questionCatalog[cat]).forEach(diff => {
      if (selectedDifficulties.size > 0 && !selectedDifficulties.has(diff)) return;
      total += questionCatalog[cat][diff];
    });
  });
  return total;
}

function updateFilterCount() {
  const total = countMatchingQuestions();
  if (filterCountDisplay) {
    filterCountDisplay.textContent = `$ questions disponibles avec ce filtre : ${total}`;
    filterCountDisplay.style.color = total === 0 ? 'var(--color-a)' : 'var(--color-d)';
  }
  if (startBtn) {
    startBtn.disabled = total === 0;
  }
}

// Crée une puce cliquable. selectionSet vide = « Tout » actif.
function makeChip(label, count, selectionSet, allChipRef) {
  const chip = document.createElement('span');
  chip.className = 'filter-chip';
  chip.innerHTML = count !== null
    ? `${escapeHtml(label)}<span class="chip-count">(${count})</span>`
    : escapeHtml(label);

  chip.addEventListener('click', () => {
    window.soundManager.playClick();
    if (selectionSet.has(label)) {
      selectionSet.delete(label);
    } else {
      selectionSet.add(label);
    }
    // Si tout est décoché, on revient au mode « Tout »
    chip.classList.toggle('active', selectionSet.has(label));
    if (allChipRef) allChipRef.classList.toggle('active', selectionSet.size === 0);
    updateFilterCount();
  });

  return chip;
}

function renderFilterChips() {
  if (!categoryChipsContainer || !difficultyChipsContainer) return;

  // --- Catégories ---
  categoryChipsContainer.innerHTML = '';
  const allCatChip = document.createElement('span');
  allCatChip.className = 'filter-chip active';
  allCatChip.textContent = '🌐 Toutes';
  allCatChip.addEventListener('click', () => {
    window.soundManager.playClick();
    selectedCategories.clear();
    allCatChip.classList.add('active');
    categoryChipsContainer.querySelectorAll('.filter-chip').forEach(c => {
      if (c !== allCatChip) c.classList.remove('active');
    });
    updateFilterCount();
  });
  categoryChipsContainer.appendChild(allCatChip);

  Object.keys(questionCatalog).sort((a, b) => a.localeCompare(b)).forEach(cat => {
    const count = Object.values(questionCatalog[cat]).reduce((s, n) => s + n, 0);
    categoryChipsContainer.appendChild(makeChip(cat, count, selectedCategories, allCatChip));
  });

  // --- Niveaux ---
  difficultyChipsContainer.innerHTML = '';
  const allDiffChip = document.createElement('span');
  allDiffChip.className = 'filter-chip active';
  allDiffChip.textContent = '🎲 Tous';
  allDiffChip.addEventListener('click', () => {
    window.soundManager.playClick();
    selectedDifficulties.clear();
    allDiffChip.classList.add('active');
    difficultyChipsContainer.querySelectorAll('.filter-chip').forEach(c => {
      if (c !== allDiffChip) c.classList.remove('active');
    });
    updateFilterCount();
  });
  difficultyChipsContainer.appendChild(allDiffChip);

  const allDiffs = new Set();
  Object.values(questionCatalog).forEach(byDiff => Object.keys(byDiff).forEach(d => allDiffs.add(d)));
  DIFFICULTY_ORDER.filter(d => allDiffs.has(d)).forEach(diff => {
    let count = 0;
    Object.values(questionCatalog).forEach(byDiff => { count += byDiff[diff] || 0; });
    difficultyChipsContainer.appendChild(makeChip(diff, count, selectedDifficulties, allDiffChip));
  });

  updateFilterCount();
}

function switchView(viewName) {
  Object.keys(views).forEach(k => {
    if (views[k]) {
      views[k].style.display = (k === viewName) ? 'block' : 'none';
    }
  });
}

const hostErrorBanner = document.getElementById('host-error-banner');
const btnCopyInvite = document.getElementById('btn-copy-invite');

function showHostError(msg) {
  if (hostErrorBanner) {
    hostErrorBanner.textContent = msg;
    hostErrorBanner.style.display = 'block';
    setTimeout(() => {
      hostErrorBanner.style.display = 'none';
    }, 6000);
  } else {
    alert(msg);
  }
}

const customUrlInput = document.getElementById('custom-public-url');

// Récupérer l'URL de base d'invitation (Cloudflare ou Origin)
function getBaseInviteUrl() {
  const customUrl = customUrlInput ? customUrlInput.value.trim() : '';
  if (customUrl) {
    return customUrl.replace(/\/+$/, '');
  }
  return window.location.origin;
}

// Fonction de rendu dynamique du QR Code
function renderLobbyQrCode(pin) {
  if (!pin) return;
  const qrContainer = document.getElementById('lobby-qrcode');
  if (qrContainer && typeof window.QRCode !== 'undefined') {
    try {
      qrContainer.innerHTML = '';
      const baseUrl = getBaseInviteUrl();
      const inviteUrl = `${baseUrl}/player.html?pin=${pin}`;
      new window.QRCode(qrContainer, {
        text: inviteUrl,
        width: 150,
        height: 150,
        colorDark: '#090d13',
        colorLight: '#ffffff'
      });
    } catch (e) {
      console.error('[Host] Erreur génération QR Code :', e);
    }
  }
}

// Initialisation de l'input d'URL personnalisée (mémoire locale)
if (customUrlInput) {
  const savedUrl = localStorage.getItem('devarena_custom_url');
  if (savedUrl) {
    customUrlInput.value = savedUrl;
  }
  
  customUrlInput.addEventListener('input', () => {
    localStorage.setItem('devarena_custom_url', customUrlInput.value.trim());
    renderLobbyQrCode(currentRoomPin);
  });
}

// 1. Initialisation / reconnexion de la salle
// Le PIN est mémorisé dans sessionStorage : un rechargement de page (ou une
// micro-coupure réseau) tente une reconnexion plutôt que de créer une salle neuve.
const HOST_SESSION_KEY = 'devarena_host_pin';

function getSavedHostPin() {
  try { return sessionStorage.getItem(HOST_SESSION_KEY); } catch (e) { return null; }
}
function saveHostPin(pin) {
  try { sessionStorage.setItem(HOST_SESSION_KEY, pin); } catch (e) { /* ignore */ }
}
function clearHostPin() {
  try { sessionStorage.removeItem(HOST_SESSION_KEY); } catch (e) { /* ignore */ }
}

// À chaque (re)connexion du socket : reprendre la salle en mémoire/session, sinon en créer une
socket.on('connect', () => {
  const knownPin = currentRoomPin || getSavedHostPin();
  if (knownPin) {
    console.log(`[Host] Tentative de reconnexion à la salle ${knownPin}...`);
    socket.emit('host:reconnect', { pin: knownPin });
  } else {
    socket.emit('host:create_room');
  }
});

// Échec de reconnexion (salle expirée) : on repart sur une salle neuve
socket.on('host:reconnect_failed', () => {
  console.log('[Host] Reconnexion impossible (salle expirée), création d\'une nouvelle salle.');
  clearHostPin();
  currentRoomPin = null;
  socket.emit('host:create_room');
});

socket.on('host:room_created', ({ pin, totalQuestionsAvailable, catalog }) => {
  currentRoomPin = pin;
  saveHostPin(pin);
  if (pinDisplay) pinDisplay.textContent = pin;
  console.log(`[Host] Salle prête avec le PIN ${pin} (${totalQuestionsAvailable} questions dispo)`);

  questionCatalog = catalog || {};
  renderFilterChips();

  renderLobbyQrCode(pin);
  switchView('lobby');
  // Ambiance arcade (démarre au 1er clic si l'autoplay est bloqué par le navigateur)
  window.soundManager.startMusic();
});

// Reconnexion réussie : rétablir le contexte. La vue précise (question/résultat/podium)
// est ensuite fixée par l'événement de jeu resynchronisé qui suit.
socket.on('host:reconnected', ({ pin, catalog, state }) => {
  currentRoomPin = pin;
  saveHostPin(pin);
  if (pinDisplay) pinDisplay.textContent = pin;
  questionCatalog = catalog || {};
  renderFilterChips();
  renderLobbyQrCode(pin);
  console.log(`[Host] Reconnecté à la salle ${pin} (état: ${state})`);

  if (state !== 'GAME_OVER') {
    window.soundManager.startMusic();
  }
  if (state === 'LOBBY') {
    switchView('lobby');
  }
  // QUESTION / ROUND_RESULT / GAME_OVER : la vue est fixée par l'événement suivant
});

// Bouton copier le lien d'invitation direct
if (btnCopyInvite) {
  btnCopyInvite.addEventListener('click', () => {
    if (!currentRoomPin) return;
    const baseUrl = getBaseInviteUrl();
    const inviteUrl = `${baseUrl}/player.html?pin=${currentRoomPin}`;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      btnCopyInvite.textContent = '✓ Lien copié dans le presse-papier !';
      window.soundManager.playClick();
      setTimeout(() => {
        btnCopyInvite.textContent = '📋 Copier le lien direct avec PIN';
      }, 2500);
    }).catch(() => {
      prompt('Copiez ce lien à partager aux joueurs :', inviteUrl);
    });
  });
}

// 2. Mise à jour de la liste des joueurs dans le lobby
let connectedPlayersCount = 0;

socket.on('room:player_list_updated', ({ players, count, connectedCount }) => {
  const nbConnected = (typeof connectedCount === 'number') ? connectedCount : count;
  // Blip radar quand un joueur rejoint le lobby
  if (nbConnected > connectedPlayersCount) {
    window.soundManager.playJoin();
  }
  connectedPlayersCount = nbConnected;
  if (playerCountBadge) playerCountBadge.textContent = `${nbConnected} joueur${nbConnected > 1 ? 's' : ''}`;

  if (playerGrid) {
    if (players.length === 0) {
      playerGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">
          En attente de connexion des joueurs...<br>
          <span style="font-size: 0.9rem;">Rendez-vous sur <strong>/player.html</strong> et entrez le code PIN ci-dessus.</span>
        </div>
      `;
    } else {
      playerGrid.innerHTML = players.map(p => {
        const isOnline = p.connected !== false;
        return `
        <div class="leaderboard-item" style="animation: fadeIn 0.3s ease;${isOnline ? '' : ' opacity: 0.45;'}">
          <div class="player-info">
            <span style="font-size: 1.5rem;">${getAvatarEmoji(p.avatarIndex)}</span>
            <span class="player-name">${escapeHtml(p.nickname)}</span>
          </div>
          <span class="badge ${isOnline ? 'badge-cisco' : 'badge-ansible'}">${isOnline ? 'PRÊT' : '⚠ OFFLINE'}</span>
        </div>
      `;
      }).join('');
    }
  }
});

// Gestion des messages d'erreurs du serveur
socket.on('error_message', ({ message }) => {
  showHostError(message);
  window.soundManager.playWrong();
  if (startBtn) {
    startBtn.disabled = false;
    startBtn.textContent = '🚀 Lancer la Partie';
  }
});

// 3. Déclenchement du démarrage
if (startBtn) {
  startBtn.addEventListener('click', () => {
    window.soundManager.playClick();

    if (connectedPlayersCount === 0) {
      showHostError(`⚠️ Aucun joueur n'a encore rejoint le salon ! Connectez-vous depuis un autre onglet ou smartphone sur /player.html avec le PIN ${currentRoomPin || '---'}.`);
      window.soundManager.playWrong();
      return;
    }

    startBtn.disabled = true;
    startBtn.textContent = '⏳ Initialisation de la session...';

    const count = questionCountSelect ? questionCountSelect.value : 30;
    socket.emit('host:start_game', {
      pin: currentRoomPin,
      questionCount: count,
      shuffle: true,
      categories: [...selectedCategories],
      difficulties: [...selectedDifficulties]
    });
  });
}

// Compte à rebours avant le jeu
socket.on('game:starting', ({ totalQuestions, countdown }) => {
  switchView('countdown');
  const countDisplay = document.getElementById('starting-countdown-number');
  let currentSec = countdown;
  if (countDisplay) countDisplay.textContent = currentSec;

  const interval = setInterval(() => {
    currentSec--;
    if (currentSec > 0) {
      if (countDisplay) countDisplay.textContent = currentSec;
      window.soundManager.playTick();
    } else {
      clearInterval(interval);
    }
  }, 1000);
});

// 4. Début d'une question
socket.on('game:question_started', (q) => {
  switchView('question');
  currentMaxTime = q.timeLimit || 20;

  // Réinitialiser le fil d'événements jokers
  if (jokerEventFeed) {
    jokerEventFeed.innerHTML = '';
    jokerEventFeed.style.display = 'none';
  }

  // Réinitialiser les styles des boutons
  hostAnswerButtons.forEach(btn => {
    btn.classList.remove('correct-reveal', 'dimmed');
  });

  // Metas
  if (qProgressText) qProgressText.textContent = `Question ${q.questionNumber} / ${q.totalQuestions}`;
  if (qCategoryBadge) {
    qCategoryBadge.textContent = q.category;
    qCategoryBadge.className = `badge badge-${q.category.toLowerCase()}`;
  }
  if (qDifficultyBadge) qDifficultyBadge.textContent = q.difficulty;
  // Effet machine à écrire sur l'énoncé (sauté en cas de reconnexion en cours de question)
  if (qText) {
    if (window.fx && typeof q.remainingSec !== 'number') {
      window.fx.typewriter(qText, q.question);
    } else {
      qText.textContent = q.question;
    }
  }

  // Snippet de code
  if (qCodeBox) {
    if (q.codeSnippet) {
      qCodeBox.style.display = 'block';
      qCodeBox.textContent = q.codeSnippet;
    } else {
      qCodeBox.style.display = 'none';
    }
  }

  // Options
  q.options.forEach((optText, idx) => {
    const textSpan = hostAnswerButtons[idx].querySelector('.key-text');
    if (textSpan) textSpan.textContent = optText;
  });

  // Timer UI (en cas de reconnexion, repartir du temps restant réel)
  const startingSec = (typeof q.remainingSec === 'number') ? q.remainingSec : currentMaxTime;
  if (timerCircle) {
    timerCircle.style.strokeDasharray = circumference;
    timerCircle.style.strokeDashoffset = circumference - (startingSec / currentMaxTime) * circumference;
    timerCircle.classList.remove('warning', 'danger');
  }
  if (timerText) {
    timerText.textContent = startingSec;
    timerText.classList.remove('danger');
  }

  window.soundManager.playTick();
});

// Ticks de chronomètre
socket.on('game:timer_tick', ({ remainingSec }) => {
  if (timerText) {
    timerText.textContent = remainingSec;
    timerText.classList.toggle('danger', remainingSec <= 5);
  }
  if (timerCircle) {
    const offset = circumference - (remainingSec / currentMaxTime) * circumference;
    timerCircle.style.strokeDashoffset = offset;

    if (remainingSec <= 5) {
      timerCircle.classList.add('danger');
      timerCircle.classList.remove('warning');
      // Tick qui monte en fréquence : la tension grimpe à chaque seconde
      window.soundManager.playTick(remainingSec);
    } else if (remainingSec <= 10) {
      timerCircle.classList.add('warning');
    }
  }
});

// Compteur de réponses reçues
socket.on('host:player_answered_count', ({ answeredCount, totalPlayers }) => {
  if (answeredCounter) {
    answeredCounter.textContent = `${answeredCount} / ${totalPlayers} réponses`;
  }
});

// Fil d'événements jokers pendant la question
const jokerEventFeed = document.getElementById('joker-event-feed');

socket.on('host:joker_event', ({ from, icon, jokerName, target }) => {
  if (!jokerEventFeed) return;
  jokerEventFeed.style.display = 'block';
  const line = document.createElement('div');
  line.style.animation = 'fadeIn 0.3s ease';
  line.textContent = `⚔️ ${from} lance ${icon} ${jokerName}${target ? ` sur ${target} !` : ' !'}`;
  jokerEventFeed.appendChild(line);
  window.soundManager.playTick();
});

// 5. Fin du round & Révélation
socket.on('game:round_ended', ({ correctIndex, explanation, leaderboard, isLastQuestion }) => {
  switchView('result');

  // Mettre en évidence la bonne réponse
  if (resExplanation) {
    resExplanation.innerHTML = `
      <div style="margin-bottom: 8px;">
        <strong style="color: var(--color-d);">✓ Bonne réponse : [${['A', 'B', 'C', 'D'][correctIndex]}]</strong>
      </div>
      <div style="color: var(--text-muted); font-size: 0.95rem;">${escapeHtml(explanation)}</div>
    `;
  }

  // Rendu du Leaderboard Top 5 : entrée en cascade + scores qui comptent
  if (resLeaderboardList) {
    resLeaderboardList.innerHTML = leaderboard.map((p, idx) => `
      <div class="leaderboard-item">
        <div class="player-info">
          <span class="rank-badge top-${idx + 1}">#${idx + 1}</span>
          <span style="font-size: 1.3rem;">${getAvatarEmoji(p.avatarIndex)}</span>
          <span class="player-name">${escapeHtml(p.nickname)} ${p.streak > 1 ? `🔥<small style="color: var(--color-c); font-size: 0.8rem;">x${p.streak}</small>` : ''}</span>
        </div>
        <div style="text-align: right;">
          <div class="player-score" data-score="${p.score}" data-gained="${p.lastPoints || 0}">${p.score} pts</div>
          ${p.lastPoints > 0 ? `<small style="color: var(--color-d);">+${p.lastPoints}</small>` : ''}
        </div>
      </div>
    `).join('');

    if (window.fx) {
      window.fx.staggerList(resLeaderboardList, 90);
      resLeaderboardList.querySelectorAll('.player-score').forEach(el => {
        const score = parseInt(el.dataset.score, 10);
        const gained = parseInt(el.dataset.gained, 10);
        if (gained > 0) {
          window.fx.countUp(el, score - gained, score, { suffix: ' pts', duration: 1100 });
        }
      });
    }
  }

  // Bouton suivant
  if (btnNextQuestion) {
    btnNextQuestion.textContent = isLastQuestion ? '🏆 Voir le Podium Final' : '▶ Question Suivante';
  }

  // Roulement de tambour puis accord de révélation
  window.soundManager.playReveal();
  setTimeout(() => window.soundManager.playCorrect(), 700);
});

if (btnNextQuestion) {
  btnNextQuestion.addEventListener('click', () => {
    window.soundManager.playClick();
    socket.emit('host:next_question', { pin: currentRoomPin });
  });
}

// --- Arrêt de la partie (mauvais filtre, faux départ...) ---
// Confirmation à 2 clics : le 1er arme le bouton en rouge, le 2e envoie l'arrêt.
function setupAbortButton(btn) {
  if (!btn) return;
  const originalText = btn.textContent;
  btn.addEventListener('click', () => {
    if (!btn.dataset.armed) {
      window.soundManager.playClick();
      btn.dataset.armed = '1';
      btn.textContent = 'Confirmer l\'arrêt ?';
      btn.classList.add('is-armed');
      setTimeout(() => {
        btn.dataset.armed = '';
        btn.textContent = originalText;
        btn.classList.remove('is-armed');
      }, 3000);
      return;
    }
    btn.dataset.armed = '';
    btn.textContent = originalText;
    btn.classList.remove('is-armed');
    socket.emit('host:abort_game', { pin: currentRoomPin });
  });
}
setupAbortButton(document.getElementById('btn-abort-question'));
setupAbortButton(document.getElementById('btn-abort-result'));

// Retour au lobby après un arrêt : PIN et joueurs conservés, prêt à relancer
socket.on('game:aborted', () => {
  if (startBtn) {
    startBtn.disabled = false;
    startBtn.textContent = '🚀 Lancer la Partie';
  }
  updateFilterCount();
  switchView('lobby');
  window.soundManager.playWrong();
});

// 6. Fin du Jeu & Podium
socket.on('game:game_over', ({ podium, fullRanking }) => {
  switchView('podium');

  if (podiumContainer) {
    const first = podium[0];
    const second = podium[1];
    const third = podium[2];

    podiumContainer.innerHTML = `
      ${second ? `
        <div class="podium-step">
          <div class="podium-player">
            <div class="podium-avatar">${getAvatarEmoji(second.avatarIndex)}</div>
            <div class="podium-name">${escapeHtml(second.nickname)}</div>
            <div class="podium-score">${second.score} pts</div>
          </div>
          <div class="podium-block step-2">2</div>
        </div>
      ` : ''}
      ${first ? `
        <div class="podium-step">
          <div class="podium-player">
            <div style="font-size: 1.8rem;">👑</div>
            <div class="podium-avatar">${getAvatarEmoji(first.avatarIndex)}</div>
            <div class="podium-name">${escapeHtml(first.nickname)}</div>
            <div class="podium-score">${first.score} pts</div>
          </div>
          <div class="podium-block step-1">1</div>
        </div>
      ` : ''}
      ${third ? `
        <div class="podium-step">
          <div class="podium-player">
            <div class="podium-avatar">${getAvatarEmoji(third.avatarIndex)}</div>
            <div class="podium-name">${escapeHtml(third.nickname)}</div>
            <div class="podium-score">${third.score} pts</div>
          </div>
          <div class="podium-block step-3">3</div>
        </div>
      ` : ''}
    `;
  }

  // Confettis quand la 1re place se dévoile (cascade CSS : ~1.55s + montée)
  if (window.fx) {
    setTimeout(() => window.fx.confetti({ durationMs: 4500 }), 1600);
  }

  // Tableau complet des scores
  if (finalLeaderboardList) {
    finalLeaderboardList.innerHTML = fullRanking.map(p => `
      <div class="leaderboard-item">
        <div class="player-info">
          <span class="rank-badge top-${p.rank}">#${p.rank}</span>
          <span style="font-size: 1.2rem;">${getAvatarEmoji(p.avatarIndex)}</span>
          <span class="player-name">${escapeHtml(p.nickname)}</span>
        </div>
        <div style="text-align: right;">
          <span class="player-score">${p.score} pts</span>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${p.totalCorrect}/${p.totalQuestions} (${p.accuracy}%)</div>
        </div>
      </div>
    `).join('');
    if (window.fx) window.fx.staggerList(finalLeaderboardList, 60);
  }

  window.soundManager.stopMusic();
  window.soundManager.playVictory();

  // Charger le Hall of Fame all-time (la partie vient d'être enregistrée en base)
  loadHostHallOfFame();
});

async function loadHostHallOfFame() {
  const container = document.getElementById('host-hall-of-fame');
  const list = document.getElementById('host-hall-of-fame-list');
  if (!container || !list) return;
  try {
    const res = await fetch('/api/scores/top?limit=10');
    if (!res.ok) return;
    const { topScores } = await res.json();
    if (!Array.isArray(topScores) || topScores.length === 0) return;

    const medals = ['🥇', '🥈', '🥉'];
    list.innerHTML = topScores.map((s, idx) => `
      <div class="leaderboard-item">
        <div class="player-info">
          <span class="rank-badge top-${idx + 1}">${medals[idx] || '#' + (idx + 1)}</span>
          <span class="player-name">${escapeHtml(s.nickname)}</span>
        </div>
        <div style="text-align: right;">
          <span class="player-score">${s.score} pts</span>
          <div style="font-size: 0.72rem; color: var(--text-muted);">${s.total_correct}/${s.total_questions} bonnes${formatGameDate(s.played_at) ? ' · ' + formatGameDate(s.played_at) : ''}</div>
        </div>
      </div>
    `).join('');
    container.style.display = 'block';
  } catch (e) {
    /* base indisponible : section masquée */
  }
}

if (btnRestart) {
  btnRestart.addEventListener('click', () => {
    // Nouvelle arène : on oublie le PIN pour forcer la création d'une salle neuve
    clearHostPin();
    currentRoomPin = null;
    window.location.reload();
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}

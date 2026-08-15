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

// 1. Initialisation de la salle
socket.emit('host:create_room');

socket.on('host:room_created', ({ pin, totalQuestionsAvailable }) => {
  currentRoomPin = pin;
  if (pinDisplay) pinDisplay.textContent = pin;
  console.log(`[Host] Salle prête avec le PIN ${pin} (${totalQuestionsAvailable} questions dispo)`);

  renderLobbyQrCode(pin);
  switchView('lobby');
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

socket.on('room:player_list_updated', ({ players, count }) => {
  connectedPlayersCount = count;
  if (playerCountBadge) playerCountBadge.textContent = `${count} joueur${count > 1 ? 's' : ''}`;
  
  if (playerGrid) {
    if (players.length === 0) {
      playerGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">
          En attente de connexion des joueurs...<br>
          <span style="font-size: 0.9rem;">Rendez-vous sur <strong>/player.html</strong> et entrez le code PIN ci-dessus.</span>
        </div>
      `;
    } else {
      playerGrid.innerHTML = players.map(p => `
        <div class="leaderboard-item" style="animation: fadeIn 0.3s ease;">
          <div class="player-info">
            <span style="font-size: 1.5rem;">${getAvatarEmoji(p.avatarIndex)}</span>
            <span class="player-name">${escapeHtml(p.nickname)}</span>
          </div>
          <span class="badge badge-cisco">PRÊT</span>
        </div>
      `).join('');
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
      shuffle: true
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
  if (qText) qText.textContent = q.question;

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

  // Timer UI
  if (timerCircle) {
    timerCircle.style.strokeDasharray = circumference;
    timerCircle.style.strokeDashoffset = 0;
    timerCircle.classList.remove('warning', 'danger');
  }
  if (timerText) timerText.textContent = currentMaxTime;

  window.soundManager.playTick();
});

// Ticks de chronomètre
socket.on('game:timer_tick', ({ remainingSec }) => {
  if (timerText) timerText.textContent = remainingSec;
  if (timerCircle) {
    const offset = circumference - (remainingSec / currentMaxTime) * circumference;
    timerCircle.style.strokeDashoffset = offset;

    if (remainingSec <= 5) {
      timerCircle.classList.add('danger');
      timerCircle.classList.remove('warning');
      window.soundManager.playTick();
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

  // Rendu du Leaderboard Top 5
  if (resLeaderboardList) {
    resLeaderboardList.innerHTML = leaderboard.map((p, idx) => `
      <div class="leaderboard-item">
        <div class="player-info">
          <span class="rank-badge top-${idx + 1}">#${idx + 1}</span>
          <span style="font-size: 1.3rem;">${getAvatarEmoji(p.avatarIndex)}</span>
          <span class="player-name">${escapeHtml(p.nickname)} ${p.streak > 1 ? `🔥<small style="color: var(--color-c); font-size: 0.8rem;">x${p.streak}</small>` : ''}</span>
        </div>
        <div style="text-align: right;">
          <div class="player-score">${p.score} pts</div>
          ${p.lastPoints > 0 ? `<small style="color: var(--color-d);">+${p.lastPoints}</small>` : ''}
        </div>
      </div>
    `).join('');
  }

  // Bouton suivant
  if (btnNextQuestion) {
    btnNextQuestion.textContent = isLastQuestion ? '🏆 Voir le Podium Final' : '▶ Question Suivante';
  }

  window.soundManager.playCorrect();
});

if (btnNextQuestion) {
  btnNextQuestion.addEventListener('click', () => {
    window.soundManager.playClick();
    socket.emit('host:next_question', { pin: currentRoomPin });
  });
}

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
  }

  window.soundManager.playVictory();
});

if (btnRestart) {
  btnRestart.addEventListener('click', () => {
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

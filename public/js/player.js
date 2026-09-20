// ==========================================================================
// DEVARENA - PLAYER CONTROLLER (Écran Joueur Mobile-First)
// ==========================================================================

const socket = io();

// Vues
const views = {
  join: document.getElementById('view-player-join'),
  waiting: document.getElementById('view-player-waiting'),
  question: document.getElementById('view-player-question'),
  answered: document.getElementById('view-player-answered'),
  result: document.getElementById('view-player-result'),
  gameOver: document.getElementById('view-player-gameover')
};

// Formulaire Join
const inputPin = document.getElementById('player-pin-input');
const inputNick = document.getElementById('player-nick-input');
const btnJoin = document.getElementById('btn-player-join');
const joinErrorMsg = document.getElementById('player-join-error');

// Waiting
const waitingPinBadge = document.getElementById('waiting-pin-badge');
const waitingPlayerAvatar = document.getElementById('waiting-player-avatar');
const waitingPlayerName = document.getElementById('waiting-player-name');

// Question & Timer
const playerHeaderScore = document.getElementById('player-header-score');
const playerHeaderStreak = document.getElementById('player-header-streak');
const playerProgressText = document.getElementById('player-progress-text');
const playerCategoryBadge = document.getElementById('player-category-badge');
const playerDifficultyBadge = document.getElementById('player-difficulty-badge');
const playerQuestionText = document.getElementById('player-question-text');
const playerCodeBox = document.getElementById('player-code-box');
const playerTimerText = document.getElementById('player-timer-text');
const playerTimerBar = document.getElementById('player-timer-bar');

const btnAnsA = document.getElementById('player-btn-a');
const btnAnsB = document.getElementById('player-btn-b');
const btnAnsC = document.getElementById('player-btn-c');
const btnAnsD = document.getElementById('player-btn-d');
const playerButtons = [btnAnsA, btnAnsB, btnAnsC, btnAnsD];

// Feedback Result
const feedbackBox = document.getElementById('player-feedback-box');
const feedbackIcon = document.getElementById('player-feedback-icon');
const feedbackTitle = document.getElementById('player-feedback-title');
const feedbackPoints = document.getElementById('player-feedback-points');
const feedbackRank = document.getElementById('player-feedback-rank');
const playerCorrectAnswerText = document.getElementById('player-correct-answer-text');
const playerExplanationText = document.getElementById('player-explanation-text');

// Game Over
const finalRankBadge = document.getElementById('final-player-rank');
const finalScoreBadge = document.getElementById('final-player-score');

let myRoomPin = '';
let myNickname = '';
let myScore = 0;
let myStreak = 0;
let myAvatarIndex = 0;
let playerMaxTime = 20;

// ==========================================================================
// SYSTÈME DE JOKERS - État, rendu et effets
// ==========================================================================
let jokersCatalog = [];       // reçu du serveur au join
let myEnergy = 0;
let energyMax = 100;
let jokersUsedLocal = { defensive: false, offensive: false };
let hasAnsweredThisQuestion = false;
let activeJokerBadges = {};   // jokerId -> true (boost/shield actifs affichés)
let pendingJokerId = null;    // joker en attente de confirmation

const jokersBar = document.getElementById('player-jokers-bar');
const energyBar = document.getElementById('player-energy-bar');
const energyText = document.getElementById('player-energy-text');
const arsenalGuide = document.getElementById('arsenal-guide');
const jokerOverlay = document.getElementById('joker-confirm-overlay');
const jokerConfirmCmd = document.getElementById('joker-confirm-cmd');
const jokerConfirmDesc = document.getElementById('joker-confirm-desc');
const jokerConfirmCost = document.getElementById('joker-confirm-cost');
const jokerConfirmRun = document.getElementById('joker-confirm-run');
const jokerConfirmCancel = document.getElementById('joker-confirm-cancel');
const attackBanner = document.getElementById('attack-banner');

function updateEnergyDisplay() {
  if (energyBar) energyBar.style.width = `${Math.min(100, (myEnergy / energyMax) * 100)}%`;
  if (energyText) energyText.textContent = myEnergy;
}

// Guide de l'arsenal affiché dans la salle d'attente
function renderArsenalGuide() {
  if (!arsenalGuide || jokersCatalog.length === 0) return;
  arsenalGuide.innerHTML = `
    <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
      ⚔️ Arsenal de l'arène — gagne de l'énergie ⚡ avec tes bonnes réponses !
    </div>
    ${jokersCatalog.map(j => `
      <div class="arsenal-item">
        <span class="arsenal-icon">${j.icon}</span>
        <div>
          <div class="arsenal-name">${j.name}</div>
          <div class="arsenal-desc">${j.desc}</div>
        </div>
        <span class="arsenal-cost">${j.cost} ⚡</span>
      </div>
    `).join('')}
  `;
}

// Barre de jokers pendant une question
function renderJokersBar() {
  if (!jokersBar) return;
  jokersBar.innerHTML = '';
  jokersCatalog.forEach(j => {
    const chip = document.createElement('div');
    const isUsedActive = !!activeJokerBadges[j.id];
    const isBlocked = hasAnsweredThisQuestion || jokersUsedLocal[j.type] || myEnergy < j.cost;

    chip.className = 'joker-chip ' + (isUsedActive ? 'used-active' : (isBlocked ? 'disabled' : 'affordable'));
    chip.innerHTML = `
      <span class="joker-icon">${j.icon}</span>
      <span class="joker-cost">${isUsedActive ? 'ACTIF' : j.cost + '⚡'}</span>
    `;
    chip.title = `${j.name} — ${j.desc}`;

    chip.addEventListener('click', () => {
      if (isBlocked || isUsedActive) return;
      window.soundManager.playClick();
      openJokerConfirm(j);
    });

    jokersBar.appendChild(chip);
  });
}

function openJokerConfirm(joker) {
  pendingJokerId = joker.id;
  if (jokerConfirmCmd) jokerConfirmCmd.textContent = `$ ./${joker.name.replace(/\s+/g, '_')}`;
  if (jokerConfirmDesc) jokerConfirmDesc.textContent = joker.desc;
  if (jokerConfirmCost) jokerConfirmCost.textContent = `Coût : ${joker.cost} ⚡ (dispo : ${myEnergy} ⚡)`;
  if (jokerOverlay) jokerOverlay.style.display = 'flex';
}

function closeJokerConfirm() {
  pendingJokerId = null;
  if (jokerOverlay) jokerOverlay.style.display = 'none';
}

if (jokerConfirmRun) {
  jokerConfirmRun.addEventListener('click', () => {
    if (pendingJokerId) {
      window.soundManager.playClick();
      socket.emit('player:use_joker', { pin: myRoomPin, jokerId: pendingJokerId });
    }
    closeJokerConfirm();
  });
}
if (jokerConfirmCancel) {
  jokerConfirmCancel.addEventListener('click', closeJokerConfirm);
}
if (jokerOverlay) {
  jokerOverlay.addEventListener('click', (e) => {
    if (e.target === jokerOverlay) closeJokerConfirm();
  });
}

let bannerTimeout = null;
function showBanner(message, isNotice = false) {
  if (!attackBanner) return;
  attackBanner.textContent = message;
  attackBanner.className = 'attack-banner' + (isNotice ? ' notice' : '');
  attackBanner.style.display = 'block';
  clearTimeout(bannerTimeout);
  bannerTimeout = setTimeout(() => {
    attackBanner.style.display = 'none';
  }, 3500);
}

// Transformation rot13 des textes de réponse
function rot13(str) {
  return str.replace(/[a-zA-Z]/g, c => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

// --- Réception des événements jokers ---

socket.on('joker:use_ack', ({ jokerId, energy, scoreAfter, stolenAmount, target }) => {
  myEnergy = energy;
  const joker = jokersCatalog.find(j => j.id === jokerId);
  if (joker) jokersUsedLocal[joker.type] = true;

  if (jokerId === 'boost' || jokerId === 'shield') {
    activeJokerBadges[jokerId] = true;
  }
  if (jokerId === 'steal' && stolenAmount > 0) {
    myScore = scoreAfter;
    if (playerHeaderScore) playerHeaderScore.textContent = `${myScore} pts`;
    showBanner(`💰 exploit réussi : +${stolenAmount} pts volés à ${target} !`, true);
  } else if (target) {
    showBanner(`${joker ? joker.icon : '⚔️'} Attaque lancée sur ${target} !`, true);
  } else if (joker) {
    showBanner(`${joker.icon} ${joker.name} activé !`, true);
  }

  updateEnergyDisplay();
  renderJokersBar();
  // Jingle propre au joker activé
  window.soundManager.playJokerActivate(jokerId);
});

socket.on('joker:error', ({ message }) => {
  showBanner(`⛔ ${message}`);
  window.soundManager.playWrong();
});

socket.on('joker:fifty_result', ({ removedIndexes }) => {
  removedIndexes.forEach(idx => {
    const btn = playerButtons[idx];
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = '0.25';
    }
  });
});

socket.on('joker:attacked', ({ type, from, duration, amount }) => {
  window.soundManager.playAttacked(type);

  if (type === 'ddos') {
    showBanner(`💥 DDoS reçu de ${from} ! Tiens bon...`);
    document.body.classList.add('under-ddos');
    setTimeout(() => document.body.classList.remove('under-ddos'), duration || 4000);

  } else if (type === 'rot13') {
    showBanner(`🕵️ ${from} a chiffré tes réponses ! Déchiffrement en cours...`);
    const originals = [];
    playerButtons.forEach((btn, i) => {
      const span = btn.querySelector('.key-text');
      if (span) {
        originals[i] = span.textContent;
        span.textContent = rot13(span.textContent);
        span.classList.add('rot13-scrambled');
      }
    });
    setTimeout(() => {
      playerButtons.forEach((btn, i) => {
        const span = btn.querySelector('.key-text');
        if (span && originals[i] !== undefined) {
          span.textContent = originals[i];
          span.classList.remove('rot13-scrambled');
        }
      });
    }, duration || 5000);

  } else if (type === 'steal') {
    myScore = Math.max(0, myScore - (amount || 0));
    if (playerHeaderScore) playerHeaderScore.textContent = `${myScore} pts`;
    showBanner(`💰 ${from} t'a volé ${amount} pts avec un exploit !`);
  }
});

// --- Session de reconnexion (survit au rechargement de la page) ---
const SESSION_KEY = 'devarena_session';

function saveSession() {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ pin: myRoomPin, nickname: myNickname }));
  } catch (e) { /* stockage indisponible : reconnexion auto désactivée */ }
}

function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
}

function getSavedSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
  } catch (e) {
    return null;
  }
}

// Reconnexion automatique : à chaque (re)connexion du socket, si on était en partie
// (dans cette page ou avant un rechargement), on retente de rejoindre avec le même pseudo.
let initialAutoRejoinDone = false;
socket.on('connect', () => {
  if (myRoomPin && myNickname) {
    console.log('[Player] Socket reconnecté, tentative de reprise de la partie...');
    socket.emit('player:join_room', { pin: myRoomPin, nickname: myNickname });
  } else if (!initialAutoRejoinDone) {
    initialAutoRejoinDone = true;
    const saved = getSavedSession();
    if (saved && saved.pin && saved.nickname) {
      console.log('[Player] Session trouvée, tentative de reconnexion automatique...');
      socket.emit('player:join_room', { pin: saved.pin, nickname: saved.nickname });
    }
  }
});

function switchView(viewName) {
  Object.keys(views).forEach(k => {
    if (views[k]) {
      views[k].style.display = (k === viewName) ? 'flex' : 'none';
    }
  });
}

// Détection et pré-remplissage automatique du PIN depuis l'URL (?pin=123456)
document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const pinFromUrl = urlParams.get('pin');
  if (pinFromUrl && inputPin) {
    inputPin.value = pinFromUrl.trim();
    if (inputNick) inputNick.focus();
  }
});

// 1. Rejoindre la salle
if (btnJoin) {
  btnJoin.addEventListener('click', (e) => {
    e.preventDefault();
    const pin = (inputPin.value || '').trim();
    const nickname = (inputNick.value || '').trim();

    if (!pin || !nickname) {
      showError('Veuillez renseigner le code PIN et votre pseudo.');
      return;
    }

    window.soundManager.playClick();
    joinErrorMsg.style.display = 'none';
    btnJoin.disabled = true;
    btnJoin.textContent = 'Connexion au serveur...';

    socket.emit('player:join_room', { pin, nickname });
  });
}

function showError(msg) {
  if (joinErrorMsg) {
    joinErrorMsg.textContent = msg;
    joinErrorMsg.style.display = 'block';
  }
  if (btnJoin) {
    btnJoin.disabled = false;
    btnJoin.textContent = '$ connect --arena';
  }
}

socket.on('player:join_error', ({ message }) => {
  // Si une reconnexion auto échoue (partie terminée...), on oublie la session
  clearSession();
  switchView('join');
  showError(message);
  window.soundManager.playWrong();
});

socket.on('player:join_success', ({ pin, player, resumed, state, jokers, energyMax: srvEnergyMax }) => {
  myRoomPin = pin;
  myNickname = player.nickname;
  myAvatarIndex = player.avatarIndex;
  myScore = player.score || 0;
  myStreak = player.streak || 0;
  myEnergy = player.energy || 0;
  if (Array.isArray(jokers)) jokersCatalog = jokers;
  if (srvEnergyMax) energyMax = srvEnergyMax;
  renderArsenalGuide();
  updateEnergyDisplay();
  saveSession();

  if (waitingPinBadge) waitingPinBadge.textContent = `#${pin}`;
  if (waitingPlayerAvatar) waitingPlayerAvatar.textContent = getAvatarEmoji(myAvatarIndex);
  if (waitingPlayerName) waitingPlayerName.textContent = myNickname;

  if (resumed && state !== 'QUESTION') {
    // Reconnecté entre deux questions : écran d'attente avec confirmation
    switchView('answered');
    const statusMsg = document.getElementById('answered-status-msg');
    if (statusMsg) {
      statusMsg.textContent = `✔ Reconnecté ! Score conservé : ${myScore} pts. En attente de la prochaine question...`;
    }
  } else if (!resumed) {
    switchView('waiting');
  }
  // Si resumed en plein QUESTION : le serveur renvoie game:question_started juste après.

  window.soundManager.playCorrect();
  window.soundManager.startMusic();
});

// 2. Démarrage de la partie
socket.on('game:starting', () => {
  switchView('waiting');
  const waitingText = document.getElementById('waiting-status-text');
  if (waitingText) {
    waitingText.textContent = '🚀 Lancement du protocole de test... Préparez-vous !';
  }
});

// 3. Question en cours
socket.on('game:question_started', (q) => {
  // Reconnexion en pleine question alors qu'on avait déjà répondu : écran d'attente
  if (q.alreadyAnswered) {
    switchView('answered');
    const statusMsg = document.getElementById('answered-status-msg');
    if (statusMsg) {
      statusMsg.textContent = '✔ Reconnecté ! Ta réponse à cette question est déjà enregistrée.';
    }
    playerMaxTime = q.timeLimit || 20;
    return;
  }

  switchView('question');

  playerMaxTime = q.timeLimit || 20;

  // Réinitialisation de l'état des jokers pour la nouvelle question
  hasAnsweredThisQuestion = false;
  const answeredTimer = document.getElementById('answered-timer');
  if (answeredTimer) answeredTimer.style.display = 'none';
  jokersUsedLocal = { defensive: false, offensive: false };
  activeJokerBadges = {};
  closeJokerConfirm();
  renderJokersBar();
  updateEnergyDisplay();

  if (playerProgressText) playerProgressText.textContent = `Q ${q.questionNumber}/${q.totalQuestions}`;
  if (playerHeaderScore) playerHeaderScore.textContent = `${myScore} pts`;
  if (playerHeaderStreak) playerHeaderStreak.textContent = myStreak > 1 ? `🔥 x${myStreak}` : '';

  // Affichage de la question et des métadonnées (machine à écrire, sauf reconnexion)
  if (playerQuestionText) {
    if (window.fx && typeof q.remainingSec !== 'number') {
      window.fx.typewriter(playerQuestionText, q.question, 550);
    } else {
      playerQuestionText.textContent = q.question;
    }
  }
  if (playerCategoryBadge) {
    playerCategoryBadge.textContent = q.category;
    playerCategoryBadge.className = `badge badge-${(q.category || 'devops').toLowerCase()}`;
  }
  if (playerDifficultyBadge) playerDifficultyBadge.textContent = q.difficulty || 'Normal';

  // Bloc de code
  if (playerCodeBox) {
    if (q.codeSnippet) {
      playerCodeBox.style.display = 'block';
      playerCodeBox.textContent = q.codeSnippet;
    } else {
      playerCodeBox.style.display = 'none';
    }
  }

  // Réinitialiser le timer (en cas de reconnexion, repartir du temps restant réel)
  const startingSec = (typeof q.remainingSec === 'number') ? q.remainingSec : playerMaxTime;
  if (playerTimerText) playerTimerText.textContent = `⏱️ ${startingSec}s`;
  if (playerTimerBar) {
    playerTimerBar.style.width = `${Math.max(0, startingSec / playerMaxTime) * 100}%`;
    playerTimerBar.style.backgroundColor = 'var(--color-d)';
    playerTimerBar.classList.remove('player-timer-urgent');
  }

  // Réinitialiser les boutons de réponse
  playerButtons.forEach((btn, idx) => {
    btn.disabled = false;
    btn.classList.remove('pressed');
    btn.style.opacity = '';
    const textSpan = btn.querySelector('.key-text');
    if (textSpan && q.options[idx]) {
      textSpan.textContent = q.options[idx];
      textSpan.classList.remove('rot13-scrambled');
    }
  });

  window.soundManager.playTick();
});

// Décompte du chronomètre côté joueur
socket.on('game:timer_tick', ({ remainingSec }) => {
  if (playerTimerText) playerTimerText.textContent = `⏱️ ${remainingSec}s`;

  // Écran d'attente après réponse : afficher le temps max avant la révélation
  const answeredTimer = document.getElementById('answered-timer');
  const answeredTimerSec = document.getElementById('answered-timer-sec');
  if (answeredTimer && answeredTimerSec && hasAnsweredThisQuestion) {
    answeredTimer.style.display = 'block';
    answeredTimerSec.textContent = remainingSec;
  }
  if (playerTimerBar) {
    const ratio = Math.max(0, remainingSec / playerMaxTime);
    playerTimerBar.style.width = `${ratio * 100}%`;
    if (remainingSec <= 5) {
      playerTimerBar.style.backgroundColor = 'var(--color-a)';
      playerTimerBar.classList.add('player-timer-urgent');
      // Tick de tension uniquement si le joueur n'a pas encore répondu
      if (!hasAnsweredThisQuestion) {
        window.soundManager.playTick(remainingSec);
      }
    } else if (remainingSec <= 10) {
      playerTimerBar.style.backgroundColor = 'var(--color-c)';
    }
  }
});

// Clics sur les touches A, B, C, D
playerButtons.forEach((btn, index) => {
  btn.addEventListener('click', () => {
    window.soundManager.playLock();

    // Verrouillage immédiat pour éviter le double-envoi
    hasAnsweredThisQuestion = true;
    closeJokerConfirm();
    playerButtons.forEach(b => b.disabled = true);
    btn.classList.add('pressed');

    socket.emit('player:submit_answer', {
      pin: myRoomPin,
      answerIndex: index
    });

    // Passer à l'écran d'attente de validation
    switchView('answered');
  });
});

socket.on('player:answer_acknowledged', () => {
  const statusMsg = document.getElementById('answered-status-msg');
  if (statusMsg) {
    statusMsg.textContent = 'Réponse transmise au serveur... En attente de la clôture du round.';
  }
});

// 4. Résultat individuel du round
socket.on('player:round_result', (result) => {
  switchView('result');

  myScore = result.currentScore;
  myStreak = result.streak;
  if (typeof result.energy === 'number') {
    myEnergy = result.energy;
    updateEnergyDisplay();
  }

  if (result.isCorrect) {
    feedbackBox.className = 'feedback-screen feedback-correct';
    feedbackIcon.textContent = '🎯';
    feedbackTitle.textContent = 'EXCELLENT !';
    feedbackTitle.style.color = 'var(--color-d)';
    // Les points gagnés comptent devant les yeux du joueur
    if (window.fx) {
      window.fx.countUp(feedbackPoints, 0, result.pointsGained, { prefix: '+', suffix: ' pts', duration: 1000 });
    } else {
      feedbackPoints.textContent = `+${result.pointsGained} pts`;
    }
    window.soundManager.playCorrect();
  } else {
    feedbackBox.className = 'feedback-screen feedback-wrong';
    feedbackIcon.textContent = '💥';
    feedbackTitle.textContent = result.hasAnswered ? 'MAUVAISE RÉPONSE' : 'TEMPS ÉCOULÉ';
    feedbackTitle.style.color = 'var(--color-a)';
    feedbackPoints.textContent = `+0 pt`;
    window.soundManager.playWrong();
  }

  if (feedbackRank) {
    feedbackRank.textContent = `Tu es actuellement #${result.rank} au classement`;
  }

  // Affichage de la solution validée et de l'explication technique
  if (playerCorrectAnswerText) {
    const letter = result.correctOptionLetter || ['A', 'B', 'C', 'D'][result.correctIndex || 0];
    const text = result.correctAnswerText || '';
    playerCorrectAnswerText.textContent = `[${letter}] ${text}`;
  }

  if (playerExplanationText) {
    playerExplanationText.textContent = result.explanation || 'Validation terminée par le moteur DevArena.';
  }

  // Top 5 de l'arène : la ligne du joueur est mise en évidence
  const top5List = document.getElementById('player-top5-list');
  if (top5List && Array.isArray(result.topFive)) {
    top5List.innerHTML = result.topFive.map(p => {
      const isMe = p.nickname === myNickname;
      return `
      <div class="leaderboard-item" style="padding: 8px 12px;${isMe ? ' border-color: var(--color-b); background-color: rgba(88, 166, 255, 0.08);' : ''}">
        <div class="player-info">
          <span class="rank-badge top-${p.rank}">#${p.rank}</span>
          <span style="font-size: 1.1rem;">${getAvatarEmoji(p.avatarIndex)}</span>
          <span class="player-name" style="font-size: 0.9rem;">${escapeHtmlCommon(p.nickname)}${isMe ? ' <small style="color: var(--color-b);">(toi)</small>' : ''}</span>
        </div>
        <span class="player-score" style="font-size: 0.9rem;">${p.score} pts</span>
      </div>`;
    }).join('');
    if (window.fx) window.fx.staggerList(top5List, 70);
  }
});

// 5. Fin de la partie
socket.on('game:game_over', ({ fullRanking }) => {
  clearSession();
  switchView('gameOver');

  const me = fullRanking.find(p => p.id === socket.id);
  if (me) {
    if (finalRankBadge) finalRankBadge.textContent = `#${me.rank}`;
    if (finalScoreBadge) finalScoreBadge.textContent = `${me.score} pts (${me.accuracy}% de réussite)`;
    // Pluie de confettis pour le champion de l'arène
    if (me.rank === 1 && window.fx) {
      window.fx.confetti({ durationMs: 4000 });
    }
  }

  window.soundManager.stopMusic();
  window.soundManager.playVictory();
});

// L'hôte a arrêté la partie : retour à la salle d'attente, compteurs remis à zéro
socket.on('game:aborted', ({ message }) => {
  myScore = 0;
  myStreak = 0;
  myEnergy = 0;
  hasAnsweredThisQuestion = false;
  jokersUsedLocal = { defensive: false, offensive: false };
  activeJokerBadges = {};
  closeJokerConfirm();
  updateEnergyDisplay();
  if (playerHeaderScore) playerHeaderScore.textContent = '0 pts';
  if (playerHeaderStreak) playerHeaderStreak.textContent = '';
  const answeredTimer = document.getElementById('answered-timer');
  if (answeredTimer) answeredTimer.style.display = 'none';

  const waitingText = document.getElementById('waiting-status-text');
  if (waitingText) {
    waitingText.textContent = '⏹ Partie arrêtée par le Maître du jeu. En attente d\'un nouveau lancement...';
  }
  switchView('waiting');
  showBanner(`⏹ ${message || 'Le Maître du jeu a arrêté la partie.'}`, true);
  window.soundManager.playWrong();
});

// L'hôte s'est déconnecté temporairement (période de grâce) : on prévient sans bloquer
socket.on('game:host_paused', ({ message }) => {
  showBanner(`⏸️ ${message || "Le Maître du jeu se reconnecte..."}`);
});

// L'hôte est revenu
socket.on('game:host_resumed', () => {
  showBanner('▶️ Le Maître du jeu est de retour !', true);
});

// Déconnexion définitive de l'hôte (grâce écoulée)
socket.on('game:host_disconnected', ({ message }) => {
  clearSession();
  alert(message);
  window.location.reload();
});

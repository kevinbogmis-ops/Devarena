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

socket.on('player:join_success', ({ pin, player, resumed, state }) => {
  myRoomPin = pin;
  myNickname = player.nickname;
  myAvatarIndex = player.avatarIndex;
  myScore = player.score || 0;
  myStreak = player.streak || 0;
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

  if (playerProgressText) playerProgressText.textContent = `Q ${q.questionNumber}/${q.totalQuestions}`;
  if (playerHeaderScore) playerHeaderScore.textContent = `${myScore} pts`;
  if (playerHeaderStreak) playerHeaderStreak.textContent = myStreak > 1 ? `🔥 x${myStreak}` : '';

  // Affichage de la question et des métadonnées
  if (playerQuestionText) playerQuestionText.textContent = q.question;
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
  }

  // Réinitialiser les boutons de réponse
  playerButtons.forEach((btn, idx) => {
    btn.disabled = false;
    btn.classList.remove('pressed');
    const textSpan = btn.querySelector('.key-text');
    if (textSpan && q.options[idx]) {
      textSpan.textContent = q.options[idx];
    }
  });

  window.soundManager.playTick();
});

// Décompte du chronomètre côté joueur
socket.on('game:timer_tick', ({ remainingSec }) => {
  if (playerTimerText) playerTimerText.textContent = `⏱️ ${remainingSec}s`;
  if (playerTimerBar) {
    const ratio = Math.max(0, remainingSec / playerMaxTime);
    playerTimerBar.style.width = `${ratio * 100}%`;
    if (remainingSec <= 5) {
      playerTimerBar.style.backgroundColor = 'var(--color-a)';
    } else if (remainingSec <= 10) {
      playerTimerBar.style.backgroundColor = 'var(--color-c)';
    }
  }
});

// Clics sur les touches A, B, C, D
playerButtons.forEach((btn, index) => {
  btn.addEventListener('click', () => {
    window.soundManager.playClick();

    // Verrouillage immédiat pour éviter le double-envoi
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

  if (result.isCorrect) {
    feedbackBox.className = 'feedback-screen feedback-correct';
    feedbackIcon.textContent = '🎯';
    feedbackTitle.textContent = 'EXCELLENT !';
    feedbackTitle.style.color = 'var(--color-d)';
    feedbackPoints.textContent = `+${result.pointsGained} pts`;
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
});

// 5. Fin de la partie
socket.on('game:game_over', ({ fullRanking }) => {
  clearSession();
  switchView('gameOver');

  const me = fullRanking.find(p => p.id === socket.id);
  if (me) {
    if (finalRankBadge) finalRankBadge.textContent = `#${me.rank}`;
    if (finalScoreBadge) finalScoreBadge.textContent = `${me.score} pts (${me.accuracy}% de réussite)`;
  }

  window.soundManager.playVictory();
});

// Déconnexion de l'hôte
socket.on('game:host_disconnected', ({ message }) => {
  clearSession();
  alert(message);
  window.location.reload();
});

// ==========================================================================
// DEVARENA - MODE RÉVISION (quiz solo, sans hôte ni chrono)
// Les questions arrivent sans la bonne réponse : chaque réponse est vérifiée
// par le serveur (POST /api/revision/:id/check), qui renvoie l'explication.
// Progression dans le navigateur (client.js : loadRevisionProgress...).
// Règles : une erreur place la question « à revoir » ; elle revient dans la
// session (2 fois max) et en tête des sessions suivantes ; deux bonnes
// réponses d'affilée = question maîtrisée.
// ==========================================================================

const DIFFICULTY_ORDER = ['Débutant', 'Intermédiaire', 'Avancé', 'Expert'];
const SESSION_SIZES = [10, 20, 50];
const MASTERY_STREAK = 2;
const MAX_REQUEUE = 2;      // nombre de retours d'une même question dans une session
const REQUEUE_DISTANCE = 3; // elle revient 3 questions plus loin

const $ = (id) => document.getElementById(id);
const views = { setup: $('view-setup'), session: $('view-session'), summary: $('view-summary') };
const optionButtons = [...document.querySelectorAll('.rev-option')];

let questions = [];
let progress = loadRevisionProgress();
let selectedCategory = null;
let selectedDifficulty = null;
let sessionSize = SESSION_SIZES[0];

let queue = [];             // ids à poser, dans l'ordre
let queuePos = 0;
let requeueCount = {};
let sessionStats = null;    // { asked, firstTryCorrect, wrong: Set, masteredBefore }
let answered = false;
let resetArmTimer = null;

// --- Statut d'une question ---

function statusOf(id) {
  const e = progress[id];
  if (!e) return 'new';
  if (e.lastResult === 'ko') return 'review';
  if (e.streak >= MASTERY_STREAK) return 'mastered';
  return 'learning';
}

function byId(id) {
  return questions.find(q => q.id === id);
}

function filteredQuestions() {
  return questions
    .filter(q => !selectedCategory || q.category === selectedCategory)
    .filter(q => !selectedDifficulty || q.difficulty === selectedDifficulty);
}

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function playSound(name) {
  if (window.soundManager && typeof window.soundManager[name] === 'function') {
    window.soundManager[name]();
  }
}

function showView(name) {
  Object.entries(views).forEach(([key, el]) => { el.style.display = key === name ? '' : 'none'; });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- Vue 1 : progression et filtres ---

function makeChip(label, countText, active, onClick) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = `filter-chip${active ? ' active' : ''}`;
  chip.innerHTML = `${escapeHtmlCommon(label)}${countText ? `<span class="chip-count">${countText}</span>` : ''}`;
  chip.addEventListener('click', () => {
    playSound('playClick');
    onClick();
    renderSetup();
  });
  return chip;
}

function renderSetup() {
  const mastered = questions.filter(q => statusOf(q.id) === 'mastered').length;
  $('rev-mastered-text').textContent = `${mastered} / ${questions.length} maîtrisées`;
  $('rev-stat-review').textContent = questions.filter(q => statusOf(q.id) === 'review').length;
  $('rev-stat-learning').textContent = questions.filter(q => statusOf(q.id) === 'learning').length;
  $('rev-stat-mastered').textContent = mastered;
  $('rev-stat-new').textContent = questions.filter(q => statusOf(q.id) === 'new').length;

  const categories = [...new Set(questions.map(q => q.category))];
  const catChips = $('rev-category-chips');
  catChips.innerHTML = '';
  catChips.appendChild(makeChip('Toutes', `${mastered}/${questions.length}`, !selectedCategory, () => { selectedCategory = null; }));
  categories.forEach(cat => {
    const inCat = questions.filter(q => q.category === cat);
    const m = inCat.filter(q => statusOf(q.id) === 'mastered').length;
    catChips.appendChild(makeChip(cat, `${m}/${inCat.length}`, selectedCategory === cat, () => { selectedCategory = cat; }));
  });

  const diffChips = $('rev-difficulty-chips');
  diffChips.innerHTML = '';
  diffChips.appendChild(makeChip('Tous', '', !selectedDifficulty, () => { selectedDifficulty = null; }));
  DIFFICULTY_ORDER.filter(d => questions.some(q => q.difficulty === d)).forEach(d => {
    diffChips.appendChild(makeChip(d, '', selectedDifficulty === d, () => { selectedDifficulty = d; }));
  });

  const sizeChips = $('rev-size-chips');
  sizeChips.innerHTML = '';
  SESSION_SIZES.forEach(size => {
    sizeChips.appendChild(makeChip(`${size} questions`, '', sessionSize === size, () => { sessionSize = size; }));
  });

  const pool = filteredQuestions();
  const poolMastered = pool.filter(q => statusOf(q.id) === 'mastered').length;
  const poolReview = pool.filter(q => statusOf(q.id) === 'review').length;
  $('rev-progress-fill').style.width = pool.length ? `${Math.round((poolMastered / pool.length) * 100)}%` : '0%';
  $('rev-filter-summary').textContent = pool.length === 0
    ? 'Aucune question ne correspond à ce filtre.'
    : `${pool.length} question${pool.length > 1 ? 's' : ''} dans ce filtre : ${poolMastered} maîtrisée${poolMastered > 1 ? 's' : ''}, ${poolReview} à revoir.`;

  $('rev-start-btn').disabled = pool.length === 0;
  $('rev-review-btn').disabled = poolReview === 0;
  $('rev-review-btn').textContent = `🔁 Revoir mes erreurs (${poolReview})`;
}

// --- Construction d'une session ---

// Priorité : à revoir, puis jamais vues, puis en cours, puis maîtrisées
function buildQueue(reviewOnly) {
  const pool = filteredQuestions();
  const groups = { review: [], new: [], learning: [], mastered: [] };
  pool.forEach(q => groups[statusOf(q.id)].push(q.id));
  const ordered = reviewOnly
    ? shuffle(groups.review)
    : [...shuffle(groups.review), ...shuffle(groups.new), ...shuffle(groups.learning), ...shuffle(groups.mastered)];
  return ordered.slice(0, sessionSize);
}

function startSession(reviewOnly) {
  queue = buildQueue(reviewOnly);
  if (queue.length === 0) return;
  queuePos = 0;
  requeueCount = {};
  sessionStats = {
    asked: 0,
    firstTryCorrect: 0,
    seen: new Set(),
    wrong: new Set(),
    masteredBefore: questions.filter(q => statusOf(q.id) === 'mastered').length
  };
  playSound('playClick');
  showView('session');
  showQuestion();
}

// --- Vue 2 : session ---

function showQuestion() {
  const q = byId(queue[queuePos]);
  if (!q) return endSession();
  answered = false;

  $('rev-term-title').textContent = `student@devarena:~/revision/${q.category.toLowerCase()}`;
  $('rev-position').textContent = `${queuePos + 1} / ${queue.length}`;
  $('rev-category-badge').textContent = q.category;
  $('rev-category-badge').className = `badge badge-${q.category.toLowerCase()}`;
  $('rev-difficulty-badge').textContent = q.difficulty || '';

  const status = statusOf(q.id);
  const statusBadge = $('rev-status-badge');
  if (status === 'review') {
    statusBadge.textContent = '🔁 À REVOIR';
    statusBadge.className = 'badge badge-ansible';
    statusBadge.style.display = '';
  } else if (status === 'new') {
    statusBadge.textContent = '🆕 NOUVELLE';
    statusBadge.className = 'badge badge-cisco';
    statusBadge.style.display = '';
  } else {
    statusBadge.style.display = 'none';
  }

  $('rev-question-text').textContent = q.question;
  const codeBox = $('rev-code-box');
  if (q.codeSnippet) {
    codeBox.textContent = q.codeSnippet;
    codeBox.style.display = 'block';
  } else {
    codeBox.style.display = 'none';
  }

  optionButtons.forEach((btn, i) => {
    btn.querySelector('.key-text').textContent = q.options[i];
    btn.disabled = false;
    btn.classList.remove('correct-reveal', 'dimmed', 'wrong-pick', 'pressed');
  });

  $('rev-feedback').style.display = 'none';
  $('rev-next-btn').style.display = 'none';
}

async function answer(index) {
  if (answered) return;
  const q = byId(queue[queuePos]);
  if (!q) return;
  answered = true;
  optionButtons.forEach(b => { b.disabled = true; });
  optionButtons[index].classList.add('pressed');

  let result;
  try {
    const res = await fetch(`/api/revision/${q.id}/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answerIndex: index })
    });
    result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erreur serveur');
  } catch (e) {
    answered = false;
    optionButtons.forEach(b => { b.disabled = false; b.classList.remove('pressed'); });
    $('rev-feedback').style.display = 'block';
    $('rev-feedback-title').textContent = '⚠ Serveur injoignable, réessaie.';
    $('rev-feedback-explanation').innerHTML = '';
    return;
  }

  recordRevisionAnswer(progress, q.id, result.correct);
  saveRevisionProgress(progress);

  const firstTime = !sessionStats.seen.has(q.id);
  sessionStats.seen.add(q.id);
  sessionStats.asked += 1;
  if (result.correct && firstTime) sessionStats.firstTryCorrect += 1;
  if (!result.correct) sessionStats.wrong.add(q.id);
  if (result.correct) sessionStats.wrong.delete(q.id);

  optionButtons.forEach((btn, i) => {
    if (i === result.correctIndex) btn.classList.add('correct-reveal');
    else if (i === index) btn.classList.add('wrong-pick');
    else btn.classList.add('dimmed');
  });

  const letter = 'ABCD'[result.correctIndex];
  const title = $('rev-feedback-title');
  title.className = `rev-feedback-title ${result.correct ? 'ok' : 'ko'}`;
  title.textContent = result.correct
    ? '✔ Bonne réponse !'
    : `✘ Raté. La bonne réponse : [${letter}] ${result.correctAnswerText}`;
  $('rev-feedback-explanation').innerHTML = result.explanation
    ? `<span class="explanation-label">💡 Pourquoi ?</span> ${formatExplanationHtml(result.explanation)}`
    : '';

  // Une erreur revient un peu plus loin dans la session (dans la limite de MAX_REQUEUE)
  let requeued = false;
  if (!result.correct && (requeueCount[q.id] || 0) < MAX_REQUEUE) {
    requeueCount[q.id] = (requeueCount[q.id] || 0) + 1;
    queue.splice(Math.min(queuePos + 1 + REQUEUE_DISTANCE, queue.length), 0, q.id);
    requeued = true;
  }
  $('rev-feedback-requeue').style.display = requeued ? 'block' : 'none';
  $('rev-position').textContent = `${queuePos + 1} / ${queue.length}`;

  $('rev-feedback').style.display = 'block';
  $('rev-next-btn').style.display = '';
  $('rev-next-btn').textContent = queuePos + 1 < queue.length ? 'Suivant →' : 'Voir le bilan →';
  $('rev-next-btn').focus({ preventScroll: true });
  playSound(result.correct ? 'playCorrect' : 'playWrong');
}

function next() {
  if (!answered) return;
  queuePos += 1;
  if (queuePos >= queue.length) return endSession();
  playSound('playClick');
  showQuestion();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- Vue 3 : bilan ---

function endSession() {
  const stats = sessionStats;
  const distinct = stats ? stats.seen.size : 0;
  const masteredNow = questions.filter(q => statusOf(q.id) === 'mastered').length;
  const gained = stats ? masteredNow - stats.masteredBefore : 0;
  const stillWrong = stats ? stats.wrong.size : 0;

  const scoreEl = $('rev-summary-score');
  scoreEl.textContent = distinct
    ? `${stats.firstTryCorrect} / ${distinct} du premier coup`
    : 'Session vide';
  const ratio = distinct ? stats.firstTryCorrect / distinct : 0;
  scoreEl.className = `rev-summary-score ${ratio >= 0.8 ? 'good' : ratio >= 0.5 ? 'medium' : 'low'}`;
  const parts = [];
  if (gained > 0) parts.push(`${gained} nouvelle${gained > 1 ? 's' : ''} question${gained > 1 ? 's' : ''} maîtrisée${gained > 1 ? 's' : ''}`);
  parts.push(stillWrong > 0
    ? `${stillWrong} question${stillWrong > 1 ? 's' : ''} à revoir : elle${stillWrong > 1 ? 's' : ''} reviendr${stillWrong > 1 ? 'ont' : 'a'} en tête de la prochaine session`
    : 'aucune erreur en suspens');
  const summary = parts.join(' · ');
  $('rev-summary-text').textContent = `${summary.charAt(0).toUpperCase()}${summary.slice(1)}. Total : ${masteredNow} / ${questions.length} questions maîtrisées.`;

  renderSetup();
  showView('summary');
  if (distinct > 0 && stats.firstTryCorrect === distinct && window.fx) {
    window.fx.confetti({ durationMs: 2500 });
  }
  playSound('playVictory');
}

// --- Réinitialisation (2 clics, comme les autres actions destructrices) ---

function disarmReset() {
  clearTimeout(resetArmTimer);
  const btn = $('rev-reset-btn');
  btn.classList.remove('is-armed');
  btn.textContent = 'Réinitialiser ma progression';
}

$('rev-reset-btn').addEventListener('click', () => {
  const btn = $('rev-reset-btn');
  if (!btn.classList.contains('is-armed')) {
    btn.classList.add('is-armed');
    btn.textContent = 'Confirmer : tout effacer ?';
    resetArmTimer = setTimeout(disarmReset, 3000);
    return;
  }
  disarmReset();
  progress = {};
  saveRevisionProgress(progress);
  renderSetup();
});

// --- Événements ---

optionButtons.forEach(btn => {
  btn.addEventListener('click', () => answer(parseInt(btn.dataset.index, 10)));
});
$('rev-next-btn').addEventListener('click', next);
$('rev-stop-btn').addEventListener('click', endSession);
$('rev-start-btn').addEventListener('click', () => startSession(false));
$('rev-review-btn').addEventListener('click', () => startSession(true));
$('rev-summary-again-btn').addEventListener('click', () => startSession(false));
$('rev-summary-review-btn').addEventListener('click', () => startSession(true));
$('rev-summary-setup-btn').addEventListener('click', () => { renderSetup(); showView('setup'); });

document.addEventListener('keydown', (e) => {
  if (views.session.style.display === 'none' || e.ctrlKey || e.metaKey || e.altKey) return;
  const key = e.key.toLowerCase();
  const index = ['a', 'b', 'c', 'd'].indexOf(key) >= 0 ? ['a', 'b', 'c', 'd'].indexOf(key) : ['1', '2', '3', '4'].indexOf(key);
  if (!answered && index >= 0) {
    e.preventDefault();
    answer(index);
  } else if (answered && (e.key === 'Enter' || e.key === ' ') && document.activeElement !== $('rev-next-btn')) {
    e.preventDefault();
    next();
  }
});

// --- Chargement ---

async function init() {
  try {
    const res = await fetch('/api/revision/questions');
    const data = await res.json();
    questions = Array.isArray(data.questions) ? data.questions : [];
  } catch (e) {
    questions = [];
  }
  if (questions.length === 0) {
    $('rev-filter-summary').textContent = '⚠ Impossible de charger les questions. Vérifie que le serveur DevArena tourne.';
    $('rev-start-btn').disabled = true;
    $('rev-review-btn').disabled = true;
    return;
  }
  renderSetup();
  // Lien direct depuis le récapitulatif de fin de partie : revision.html?mode=erreurs
  if (new URLSearchParams(location.search).get('mode') === 'erreurs'
      && questions.some(q => statusOf(q.id) === 'review')) {
    sessionSize = SESSION_SIZES[SESSION_SIZES.length - 1];
    startSession(true);
  }
}

init();

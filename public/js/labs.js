// ==========================================================================
// DEVARENA - LABS « TAPE LA COMMANDE » (entraînement solo)
// La page reçoit les missions sans les solutions ; chaque commande est
// vérifiée par le serveur (POST /api/labs/:id/check).
// Progression stockée dans le navigateur (localStorage), sans compte.
// ==========================================================================

const DIFFICULTY_ORDER = ['Débutant', 'Intermédiaire', 'Avancé', 'Expert'];
const PROGRESS_KEY = 'devarena_labs_progress';

const categoryChips = document.getElementById('lab-category-chips');
const difficultyChips = document.getElementById('lab-difficulty-chips');
const todoOnlyToggle = document.getElementById('lab-todo-only');
const progressText = document.getElementById('labs-progress-text');
const progressFill = document.getElementById('labs-progress-fill');

const termTitle = document.getElementById('lab-term-title');
const positionLabel = document.getElementById('lab-position');
const labBody = document.getElementById('lab-body');
const labEmpty = document.getElementById('lab-empty');
const categoryBadge = document.getElementById('lab-category-badge');
const difficultyBadge = document.getElementById('lab-difficulty-badge');
const statusBadge = document.getElementById('lab-status-badge');
const missionText = document.getElementById('lab-mission');
const contextBlock = document.getElementById('lab-context');
const logArea = document.getElementById('lab-log');
const labForm = document.getElementById('lab-form');
const labInput = document.getElementById('lab-input');
const submitBtn = document.getElementById('lab-submit');
const hintBtn = document.getElementById('lab-hint-btn');
const revealBtn = document.getElementById('lab-reveal-btn');
const nextBtn = document.getElementById('lab-next-btn');
const hintBox = document.getElementById('lab-hint');
const explanationBox = document.getElementById('lab-explanation');

let labs = [];
let progress = loadProgress();
let selectedCategory = null;   // null = toutes
let selectedDifficulty = null; // null = tous
let currentLab = null;
let locked = false;            // lab résolu ou solution révélée : saisie terminée
let failsOnCurrent = 0;
let revealArmTimer = null;
const commandHistory = [];
let historyIndex = -1;

// --- Progression (localStorage, toujours protégé : navigation privée, etc.) ---

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveProgress() {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch (e) {
    /* stockage indisponible : la progression vit le temps de la page */
  }
}

function entryFor(id) {
  if (!progress[id]) progress[id] = { solved: false, attempts: 0, hinted: false, revealed: false };
  return progress[id];
}

function isSolved(id) {
  return !!(progress[id] && progress[id].solved);
}

// --- Utilitaires d'affichage ---

// Texte sûr, avec les `extraits` entre accents graves rendus en <code>
function formatInline(text) {
  return escapeHtmlCommon(text).replace(/`([^`]+)`/g, '<code>$1</code>');
}

function logLine(html, kind = '') {
  const line = document.createElement('div');
  line.className = `lab-log-line ${kind}`;
  line.innerHTML = html;
  logArea.appendChild(line);
  logArea.scrollTop = logArea.scrollHeight;
}

function playSound(name) {
  if (window.soundManager && typeof window.soundManager[name] === 'function') {
    window.soundManager[name]();
  }
}

// --- Filtres ---

function filteredLabs() {
  return labs
    .filter(l => !selectedCategory || l.category === selectedCategory)
    .filter(l => !selectedDifficulty || l.difficulty === selectedDifficulty)
    .sort((a, b) => (DIFFICULTY_ORDER.indexOf(a.difficulty) - DIFFICULTY_ORDER.indexOf(b.difficulty)) || (a.id - b.id));
}

function makeChip(label, countText, active, onClick) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = `filter-chip${active ? ' active' : ''}`;
  chip.innerHTML = `${escapeHtmlCommon(label)}${countText ? `<span class="chip-count">${countText}</span>` : ''}`;
  chip.addEventListener('click', () => {
    playSound('playClick');
    onClick();
  });
  return chip;
}

function renderChips() {
  const categories = [...new Set(labs.map(l => l.category))];
  categoryChips.innerHTML = '';
  categoryChips.appendChild(makeChip('Toutes', `${labs.filter(l => isSolved(l.id)).length}/${labs.length}`, !selectedCategory, () => {
    selectedCategory = null;
    onFilterChange();
  }));
  categories.forEach(cat => {
    const inCat = labs.filter(l => l.category === cat);
    const solved = inCat.filter(l => isSolved(l.id)).length;
    categoryChips.appendChild(makeChip(cat, `${solved}/${inCat.length}`, selectedCategory === cat, () => {
      selectedCategory = cat;
      onFilterChange();
    }));
  });

  difficultyChips.innerHTML = '';
  difficultyChips.appendChild(makeChip('Tous', '', !selectedDifficulty, () => {
    selectedDifficulty = null;
    onFilterChange();
  }));
  DIFFICULTY_ORDER
    .filter(d => labs.some(l => l.difficulty === d))
    .forEach(d => {
      difficultyChips.appendChild(makeChip(d, '', selectedDifficulty === d, () => {
        selectedDifficulty = d;
        onFilterChange();
      }));
    });
}

function renderProgress() {
  const list = filteredLabs();
  const solvedInFilter = list.filter(l => isSolved(l.id)).length;
  const solvedTotal = labs.filter(l => isSolved(l.id)).length;
  progressText.textContent = `${solvedTotal} / ${labs.length} réussis`;
  progressFill.style.width = list.length ? `${Math.round((solvedInFilter / list.length) * 100)}%` : '0%';
}

function onFilterChange() {
  renderChips();
  renderProgress();
  showLab(pickFirst());
}

// --- Navigation entre labs ---

function pickFirst() {
  const list = filteredLabs();
  return list.find(l => !isSolved(l.id)) || (todoOnlyToggle.checked ? null : list[0]) || null;
}

function pickNext() {
  const list = filteredLabs();
  if (list.length === 0) return null;
  const start = currentLab ? list.findIndex(l => l.id === currentLab.id) : -1;
  for (let step = 1; step <= list.length; step++) {
    const candidate = list[(start + step) % list.length];
    if (!todoOnlyToggle.checked || !isSolved(candidate.id)) return candidate;
  }
  return null;
}

function showEmpty(message) {
  currentLab = null;
  labBody.style.display = 'none';
  labEmpty.style.display = 'block';
  labEmpty.innerHTML = message;
  positionLabel.textContent = '';
  termTitle.textContent = 'student@devarena:~/labs';
}

function showLab(lab) {
  if (!lab) {
    const list = filteredLabs();
    showEmpty(list.length > 0
      ? '🏆 Tous les labs de ce filtre sont réussis. Change de filtre, ou décoche « Seulement les labs pas encore réussis » pour les rejouer.'
      : 'Aucun lab ne correspond à ce filtre.');
    return;
  }

  currentLab = lab;
  locked = false;
  failsOnCurrent = 0;
  historyIndex = -1;
  disarmReveal();

  labBody.style.display = 'block';
  labEmpty.style.display = 'none';

  const list = filteredLabs();
  positionLabel.textContent = `${list.findIndex(l => l.id === lab.id) + 1} / ${list.length}`;
  termTitle.textContent = `student@devarena:~/labs/${lab.category.toLowerCase()}`;

  categoryBadge.textContent = lab.category;
  categoryBadge.className = `badge badge-${lab.category.toLowerCase()}`;
  difficultyBadge.textContent = lab.difficulty;

  const entry = progress[lab.id];
  if (entry && entry.solved) {
    statusBadge.textContent = '✔ RÉUSSI';
    statusBadge.className = 'badge badge-supabase';
    statusBadge.style.display = '';
  } else if (entry && entry.revealed) {
    statusBadge.textContent = '👁 SOLUTION VUE';
    statusBadge.className = 'badge badge-aws';
    statusBadge.style.display = '';
  } else {
    statusBadge.style.display = 'none';
  }

  missionText.textContent = lab.mission;
  if (lab.context) {
    contextBlock.textContent = lab.context;
    contextBlock.style.display = 'block';
  } else {
    contextBlock.style.display = 'none';
  }

  logArea.innerHTML = '';
  logLine(`<span class="lab-comment"># Lab n°${lab.id}. Tape la commande, puis Entrée.</span>`);

  hintBox.style.display = 'none';
  explanationBox.style.display = 'none';
  labInput.value = '';
  setInputEnabled(true);
  hintBtn.disabled = false;
  revealBtn.disabled = false;

  // Pas de focus automatique sur écran tactile : le clavier virtuel masquerait la mission
  if (!window.matchMedia('(pointer: coarse)').matches) labInput.focus();
}

function setInputEnabled(enabled) {
  labInput.disabled = !enabled;
  submitBtn.disabled = !enabled;
}

function lockLab() {
  locked = true;
  setInputEnabled(false);
  hintBtn.disabled = true;
  revealBtn.disabled = true;
  disarmReveal();
  renderChips();
  renderProgress();
  nextBtn.focus();
}

function showExplanation(solution, explanation) {
  explanationBox.innerHTML = `
    <div class="lab-solution">Solution : <code>${escapeHtmlCommon(solution)}</code></div>
    <div>${formatInline(explanation)}</div>`;
  explanationBox.style.display = 'block';
}

// --- Actions ---

const NEAR_MESSAGES = {
  subcommand: "✘ Presque : bon outil et bonne sous-commande. Vérifie les options et les arguments.",
  command: "✘ Bon outil, mais pas la bonne sous-commande ou les bons arguments.",
  none: "✘ Ce n'est pas la commande attendue."
};

async function submitCommand(event) {
  event.preventDefault();
  if (!currentLab || locked) return;
  const answer = labInput.value.trim();
  if (!answer) return;

  commandHistory.push(answer);
  historyIndex = -1;
  logLine(`<span class="lab-ps1">$</span> ${escapeHtmlCommon(answer)}`, 'cmd');
  labInput.value = '';
  setInputEnabled(false);

  const lab = currentLab;
  try {
    const res = await fetch(`/api/labs/${lab.id}/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer })
    });
    const data = await res.json();
    if (currentLab !== lab) return; // l'utilisateur a changé de lab entre-temps

    if (!res.ok) {
      logLine(`⚠ ${escapeHtmlCommon(data.error || 'Erreur du serveur.')}`, 'warn');
      setInputEnabled(true);
      labInput.focus();
      return;
    }

    const entry = entryFor(lab.id);
    if (data.correct) {
      if (!entry.revealed) entry.solved = true;
      saveProgress();
      logLine(entry.revealed
        ? '✔ Correct ! (solution déjà vue : le lab n\'est pas compté comme réussi)'
        : '✔ Correct !', 'ok');
      showExplanation(data.solution, data.explanation);
      playSound('playCorrect');
      lockLab();
    } else {
      entry.attempts += 1;
      saveProgress();
      failsOnCurrent += 1;
      logLine(escapeHtmlCommon(NEAR_MESSAGES[data.near] || NEAR_MESSAGES.none), 'ko');
      if (failsOnCurrent === 2 && hintBox.style.display === 'none') {
        logLine('<span class="lab-comment"># Besoin d\'un coup de pouce ? Essaie 💡 Indice.</span>');
      }
      playSound('playWrong');
      setInputEnabled(true);
      labInput.focus();
    }
  } catch (e) {
    logLine('⚠ Serveur injoignable, réessaie.', 'warn');
    setInputEnabled(true);
  }
}

function showHint() {
  if (!currentLab || locked) return;
  hintBox.innerHTML = `💡 ${formatInline(currentLab.hint)}`;
  hintBox.style.display = 'block';
  entryFor(currentLab.id).hinted = true;
  saveProgress();
  playSound('playClick');
}

function disarmReveal() {
  clearTimeout(revealArmTimer);
  revealBtn.classList.remove('is-armed');
  revealBtn.textContent = '👁 Solution';
}

// Révéler la solution demande deux clics (comme l'arrêt de partie côté Host)
async function revealSolution() {
  if (!currentLab || locked) return;
  if (!revealBtn.classList.contains('is-armed')) {
    revealBtn.classList.add('is-armed');
    revealBtn.textContent = 'Confirmer ?';
    revealArmTimer = setTimeout(disarmReveal, 3000);
    return;
  }
  disarmReveal();

  const lab = currentLab;
  try {
    const res = await fetch(`/api/labs/${lab.id}/reveal`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok || currentLab !== lab) return;
    const entry = entryFor(lab.id);
    if (!entry.solved) entry.revealed = true;
    saveProgress();
    logLine('<span class="lab-comment"># Solution affichée. Retente ce lab plus tard pour le valider.</span>');
    showExplanation(data.solution, data.explanation);
    lockLab();
  } catch (e) {
    logLine('⚠ Serveur injoignable, réessaie.', 'warn');
  }
}

function goNext() {
  playSound('playClick');
  showLab(pickNext());
  renderProgress();
}

// Historique des commandes : flèches haut/bas, comme dans un vrai terminal
labInput.addEventListener('keydown', (e) => {
  if (commandHistory.length === 0) return;
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    historyIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
    labInput.value = commandHistory[historyIndex];
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (historyIndex === -1) return;
    historyIndex += 1;
    if (historyIndex >= commandHistory.length) {
      historyIndex = -1;
      labInput.value = '';
    } else {
      labInput.value = commandHistory[historyIndex];
    }
  }
});

// Lab terminé : Entrée passe au suivant
document.addEventListener('keydown', (e) => {
  if (locked && e.key === 'Enter' && document.activeElement !== nextBtn) {
    e.preventDefault();
    goNext();
  }
});

labForm.addEventListener('submit', submitCommand);
hintBtn.addEventListener('click', showHint);
revealBtn.addEventListener('click', revealSolution);
nextBtn.addEventListener('click', goNext);
todoOnlyToggle.addEventListener('change', () => {
  renderProgress();
  if (todoOnlyToggle.checked && currentLab && isSolved(currentLab.id)) showLab(pickNext());
  else if (!currentLab) showLab(pickFirst());
});

// --- Chargement ---

async function init() {
  try {
    const res = await fetch('/api/labs');
    const data = await res.json();
    labs = Array.isArray(data.labs) ? data.labs : [];
  } catch (e) {
    labs = [];
  }
  if (labs.length === 0) {
    showEmpty('⚠ Impossible de charger les labs. Vérifie que le serveur DevArena tourne.');
    return;
  }
  renderChips();
  renderProgress();
  showLab(pickFirst());
}

init();

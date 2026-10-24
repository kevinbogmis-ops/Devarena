// ==========================================================================
// DEVARENA - ÉDITEUR DE QUESTIONS (ADMIN)
// Connexion par token, liste filtrable, formulaire d'ajout/modification,
// suppression à double confirmation. Toutes les écritures passent par
// l'API /api/admin/questions (header x-admin-token).
// ==========================================================================

(function () {
  'use strict';

  const TOKEN_KEY = 'devarena_admin_token';

  const state = {
    token: sessionStorage.getItem(TOKEN_KEY) || '',
    questions: [],
    difficulties: [],
    editingId: null, // null = création, sinon id de la question modifiée
    labs: [],
    labDifficulties: [],
    editingLabId: null
  };

  // --- Raccourcis DOM ---
  const $ = id => document.getElementById(id);
  const views = {
    login: $('view-admin-login'),
    list: $('view-admin-list'),
    form: $('view-admin-form'),
    labs: $('view-admin-labs'),
    labForm: $('view-admin-lab-form')
  };

  function showView(name) {
    Object.entries(views).forEach(([key, el]) => {
      el.style.display = key === name ? 'block' : 'none';
    });
    // Onglets : visibles une fois connecté, l'onglet actif suit la vue
    $('admin-tabs').style.display = name === 'login' ? 'none' : 'flex';
    const activeTab = (name === 'labs' || name === 'labForm') ? 'labs' : 'list';
    document.querySelectorAll('.admin-tab').forEach(tab => {
      tab.classList.toggle('is-active', tab.dataset.tab === activeTab);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  function badgeClass(category) {
    return 'badge badge-' + String(category).toLowerCase().replace(/[^a-zà-ÿ0-9]/g, '');
  }

  // --- Appels API ---
  async function api(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': state.token,
        ...(options.headers || {})
      }
    });
    let body = {};
    try { body = await res.json(); } catch (_) { /* réponse vide */ }
    if (!res.ok) {
      const err = new Error(body.error || `Erreur HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return body;
  }

  async function loadQuestions() {
    const data = await api('/api/admin/questions');
    state.questions = data.questions;
    state.difficulties = data.difficulties;
  }

  async function loadLabs() {
    const data = await api('/api/admin/labs');
    state.labs = data.labs;
    state.labDifficulties = data.difficulties;
  }

  async function loadAll() {
    await loadQuestions();
    await loadLabs();
  }

  // --- Vue connexion ---
  async function tryLogin() {
    const input = $('admin-token-input');
    const errorBox = $('admin-login-error');
    state.token = input.value.trim();
    errorBox.style.display = 'none';
    if (!state.token) return;
    try {
      await loadAll();
      sessionStorage.setItem(TOKEN_KEY, state.token);
      initListView();
      initLabListView();
      showView('list');
    } catch (err) {
      errorBox.textContent = err.status === 401
        ? '⛔ Token invalide.'
        : `⚠️ ${err.message}`;
      errorBox.style.display = 'block';
    }
  }

  function logout() {
    state.token = '';
    sessionStorage.removeItem(TOKEN_KEY);
    showView('login');
  }

  // --- Vue liste ---
  function categoriesOf(questions) {
    return [...new Set(questions.map(q => q.category))].sort((a, b) => a.localeCompare(b, 'fr'));
  }

  function initListView() {
    // (Re)peupler les filtres en conservant la sélection courante
    const catSelect = $('admin-filter-category');
    const diffSelect = $('admin-filter-difficulty');
    const currentCat = catSelect.value;
    const currentDiff = diffSelect.value;

    catSelect.innerHTML = '<option value="">Toutes catégories</option>' +
      categoriesOf(state.questions).map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    diffSelect.innerHTML = '<option value="">Tous niveaux</option>' +
      state.difficulties.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
    catSelect.value = currentCat;
    diffSelect.value = currentDiff;

    renderList();
  }

  function filteredQuestions() {
    const search = $('admin-search-input').value.trim().toLowerCase();
    const cat = $('admin-filter-category').value;
    const diff = $('admin-filter-difficulty').value;
    return state.questions.filter(q =>
      (!cat || q.category === cat) &&
      (!diff || q.difficulty === diff) &&
      (!search || q.question.toLowerCase().includes(search))
    );
  }

  function renderList() {
    const listEl = $('admin-question-list');
    const visible = filteredQuestions();
    $('admin-question-count').textContent =
      `${visible.length} / ${state.questions.length} questions`;

    if (visible.length === 0) {
      listEl.innerHTML = '<div class="admin-empty">Aucune question ne correspond aux filtres.</div>';
      return;
    }

    listEl.innerHTML = visible.map(q => `
      <div class="admin-row" data-id="${q.id}">
        <span class="admin-row-id">#${q.id}</span>
        <span class="${badgeClass(q.category)}">${escapeHtml(q.category)}</span>
        <span class="admin-row-difficulty">${escapeHtml(q.difficulty)}</span>
        <span class="admin-row-question" title="${escapeHtml(q.question)}">${escapeHtml(q.question)}</span>
        <span class="admin-row-actions">
          <button class="btn-admin-action" data-action="edit" data-id="${q.id}" title="Modifier">✏️</button>
          <button class="btn-admin-action btn-admin-delete" data-action="delete" data-id="${q.id}" title="Supprimer">🗑️</button>
        </span>
      </div>
    `).join('');
  }

  function showFeedback(message, isError = false) {
    const box = $('admin-list-feedback');
    box.textContent = message;
    box.classList.toggle('is-error', isError);
    box.style.display = 'block';
    clearTimeout(showFeedback._timer);
    showFeedback._timer = setTimeout(() => { box.style.display = 'none'; }, 4000);
  }

  // Double confirmation : le 1er clic arme le bouton (renvoie false), le 2e confirme (true)
  function confirmByDoubleClick(btn) {
    if (btn.dataset.armed) return true;
    btn.dataset.armed = '1';
    btn.textContent = 'Confirmer ?';
    btn.classList.add('is-armed');
    setTimeout(() => {
      btn.dataset.armed = '';
      btn.textContent = '🗑️';
      btn.classList.remove('is-armed');
    }, 3000);
    return false;
  }

  // Suppression à double confirmation : 1er clic arme le bouton, 2e clic supprime
  async function handleDelete(btn, id) {
    if (!confirmByDoubleClick(btn)) return;
    try {
      await api(`/api/admin/questions/${id}`, { method: 'DELETE' });
      state.questions = state.questions.filter(q => q.id !== id);
      initListView();
      showFeedback(`✅ Question #${id} supprimée.`);
    } catch (err) {
      if (err.status === 401) return logout();
      showFeedback(`⛔ ${err.message}`, true);
    }
  }

  // --- Vue formulaire ---
  function renderOptionInputs(options = ['', '', '', ''], correctIndex = 0) {
    const labels = ['A', 'B', 'C', 'D'];
    $('admin-form-options').innerHTML = labels.map((label, i) => `
      <div class="admin-option-row">
        <input type="radio" name="admin-correct" id="admin-correct-${i}" value="${i}" ${i === correctIndex ? 'checked' : ''}>
        <label for="admin-correct-${i}" class="admin-option-label">${label}</label>
        <input type="text" class="input-field admin-option-input" id="admin-option-${i}"
               value="${escapeHtml(options[i] || '')}" placeholder="Option ${label}" style="margin: 0;">
      </div>
    `).join('');
  }

  function openForm(question = null) {
    state.editingId = question ? question.id : null;
    $('admin-form-title').textContent = question
      ? `devarena-admin --edit-question ${question.id}`
      : 'devarena-admin --new-question';

    // Suggestions de catégories existantes
    $('admin-category-suggestions').innerHTML =
      categoriesOf(state.questions).map(c => `<option value="${escapeHtml(c)}">`).join('');

    $('admin-form-difficulty').innerHTML =
      state.difficulties.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');

    $('admin-form-category').value = question ? question.category : '';
    $('admin-form-difficulty').value = question ? question.difficulty : state.difficulties[0];
    $('admin-form-question').value = question ? question.question : '';
    $('admin-form-snippet').value = (question && question.codeSnippet) || '';
    $('admin-form-explanation').value = (question && question.explanation) || '';
    renderOptionInputs(question ? question.options : ['', '', '', ''], question ? question.correctIndex : 0);

    $('admin-form-error').style.display = 'none';
    showView('form');
  }

  function readForm() {
    const checked = document.querySelector('input[name="admin-correct"]:checked');
    return {
      category: $('admin-form-category').value.trim(),
      difficulty: $('admin-form-difficulty').value,
      question: $('admin-form-question').value.trim(),
      codeSnippet: $('admin-form-snippet').value.trim() || null,
      options: [0, 1, 2, 3].map(i => $(`admin-option-${i}`).value.trim()),
      correctIndex: checked ? parseInt(checked.value, 10) : -1,
      explanation: $('admin-form-explanation').value.trim() || null
    };
  }

  async function saveForm() {
    const errorBox = $('admin-form-error');
    errorBox.style.display = 'none';
    const payload = readForm();
    try {
      if (state.editingId === null) {
        const { question } = await api('/api/admin/questions', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        state.questions.push(question);
        showFeedback(`✅ Question #${question.id} créée.`);
      } else {
        const { question } = await api(`/api/admin/questions/${state.editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        const idx = state.questions.findIndex(q => q.id === question.id);
        if (idx !== -1) state.questions[idx] = question;
        showFeedback(`✅ Question #${question.id} mise à jour.`);
      }
      initListView();
      showView('list');
    } catch (err) {
      if (err.status === 401) return logout();
      errorBox.textContent = `⛔ ${err.message}`;
      errorBox.style.display = 'block';
    }
  }

  // ======================================================================
  // LABS « TAPE LA COMMANDE »
  // ======================================================================
  const linesOf = text => text.split('\n').map(s => s.trim()).filter(Boolean);

  function initLabListView() {
    const catSelect = $('admin-lab-filter-category');
    const diffSelect = $('admin-lab-filter-difficulty');
    const currentCat = catSelect.value;
    const currentDiff = diffSelect.value;
    catSelect.innerHTML = '<option value="">Toutes catégories</option>' +
      categoriesOf(state.labs).map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    diffSelect.innerHTML = '<option value="">Tous niveaux</option>' +
      state.labDifficulties.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
    catSelect.value = currentCat;
    diffSelect.value = currentDiff;
    renderLabList();
  }

  function filteredLabs() {
    const search = $('admin-lab-search').value.trim().toLowerCase();
    const cat = $('admin-lab-filter-category').value;
    const diff = $('admin-lab-filter-difficulty').value;
    return state.labs.filter(l =>
      (!cat || l.category === cat) &&
      (!diff || l.difficulty === diff) &&
      (!search || l.mission.toLowerCase().includes(search) || l.solution.toLowerCase().includes(search))
    );
  }

  function renderLabList() {
    const listEl = $('admin-lab-list');
    const visible = filteredLabs();
    $('admin-lab-count').textContent = `${visible.length} / ${state.labs.length} labs`;
    if (visible.length === 0) {
      listEl.innerHTML = '<div class="admin-empty">Aucun lab ne correspond aux filtres.</div>';
      return;
    }
    listEl.innerHTML = visible.map(l => `
      <div class="admin-row" data-id="${l.id}">
        <span class="admin-row-id">#${l.id}</span>
        <span class="${badgeClass(l.category)}">${escapeHtml(l.category)}</span>
        <span class="admin-row-difficulty">${escapeHtml(l.difficulty)}</span>
        <span class="admin-row-question" title="${escapeHtml(l.mission)}"><code>${escapeHtml(l.solution)}</code> ${escapeHtml(l.mission)}</span>
        <span class="admin-row-actions">
          <button class="btn-admin-action" data-action="edit" data-id="${l.id}" title="Modifier">✏️</button>
          <button class="btn-admin-action btn-admin-delete" data-action="delete" data-id="${l.id}" title="Supprimer">🗑️</button>
        </span>
      </div>
    `).join('');
  }

  function showLabFeedback(message, isError = false) {
    const box = $('admin-lab-feedback');
    box.textContent = message;
    box.classList.toggle('is-error', isError);
    box.style.display = 'block';
    clearTimeout(showLabFeedback._timer);
    showLabFeedback._timer = setTimeout(() => { box.style.display = 'none'; }, 4000);
  }

  async function handleLabDelete(btn, id) {
    if (!confirmByDoubleClick(btn)) return;
    try {
      await api(`/api/admin/labs/${id}`, { method: 'DELETE' });
      state.labs = state.labs.filter(l => l.id !== id);
      initLabListView();
      showLabFeedback(`✅ Lab #${id} supprimé.`);
    } catch (err) {
      if (err.status === 401) return logout();
      showLabFeedback(`⛔ ${err.message}`, true);
    }
  }

  function openLabForm(lab = null) {
    state.editingLabId = lab ? lab.id : null;
    $('admin-lab-form-title').textContent = lab ? `devarena-admin --edit-lab ${lab.id}` : 'devarena-admin --new-lab';
    $('admin-lab-category-suggestions').innerHTML =
      categoriesOf(state.labs).map(c => `<option value="${escapeHtml(c)}">`).join('');
    $('admin-lab-difficulty').innerHTML =
      state.labDifficulties.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');

    $('admin-lab-category').value = lab ? lab.category : '';
    $('admin-lab-difficulty').value = lab ? lab.difficulty : state.labDifficulties[0];
    $('admin-lab-mission').value = lab ? lab.mission : '';
    $('admin-lab-context').value = (lab && lab.context) || '';
    $('admin-lab-solution').value = lab ? lab.solution : '';
    $('admin-lab-accepted').value = ((lab && lab.accepted) || []).join('\n');
    $('admin-lab-patterns').value = ((lab && lab.patterns) || []).join('\n');
    $('admin-lab-ignorecase').checked = !!(lab && lab.ignoreCase);
    $('admin-lab-hint').value = lab ? lab.hint : '';
    $('admin-lab-explanation').value = lab ? lab.explanation : '';
    $('admin-lab-try-input').value = '';
    $('admin-lab-try-result').style.display = 'none';
    $('admin-lab-form-error').style.display = 'none';
    showView('labForm');
  }

  function readLabForm() {
    return {
      category: $('admin-lab-category').value.trim(),
      difficulty: $('admin-lab-difficulty').value,
      mission: $('admin-lab-mission').value.trim(),
      context: $('admin-lab-context').value.trim() || null,
      solution: $('admin-lab-solution').value.trim(),
      accepted: linesOf($('admin-lab-accepted').value),
      patterns: linesOf($('admin-lab-patterns').value),
      ignoreCase: $('admin-lab-ignorecase').checked,
      hint: $('admin-lab-hint').value.trim(),
      explanation: $('admin-lab-explanation').value.trim()
    };
  }

  async function saveLabForm() {
    const errorBox = $('admin-lab-form-error');
    errorBox.style.display = 'none';
    const payload = readLabForm();
    try {
      if (state.editingLabId === null) {
        const { lab } = await api('/api/admin/labs', { method: 'POST', body: JSON.stringify(payload) });
        state.labs.push(lab);
        showLabFeedback(`✅ Lab #${lab.id} créé.`);
      } else {
        const { lab } = await api(`/api/admin/labs/${state.editingLabId}`, { method: 'PUT', body: JSON.stringify(payload) });
        const idx = state.labs.findIndex(l => l.id === lab.id);
        if (idx !== -1) state.labs[idx] = lab;
        showLabFeedback(`✅ Lab #${lab.id} mis à jour.`);
      }
      initLabListView();
      showView('labs');
    } catch (err) {
      if (err.status === 401) return logout();
      errorBox.textContent = `⛔ ${err.message}`;
      errorBox.style.display = 'block';
    }
  }

  // Banc d'essai : vérifie une commande avec le brouillon tel qu'il est dans le formulaire
  async function tryLabCommand() {
    const box = $('admin-lab-try-result');
    const answer = $('admin-lab-try-input').value.trim();
    if (!answer) return;
    try {
      const result = await api('/api/admin/labs/try', {
        method: 'POST',
        body: JSON.stringify({ lab: readLabForm(), answer })
      });
      const nearText = { subcommand: 'bon outil et bonne sous-commande', command: 'bon outil seulement' }[result.near];
      box.className = `admin-lab-try-result ${result.accepted ? 'is-ok' : 'is-ko'}`;
      box.textContent = result.accepted
        ? `✔ Acceptée (commande normalisée : ${result.normalized})`
        : `✘ Refusée${nearText ? ` (le joueur verra : « ${nearText} »)` : ''} — commande normalisée : ${result.normalized}`;
    } catch (err) {
      if (err.status === 401) return logout();
      box.className = 'admin-lab-try-result is-ko';
      box.textContent = `⛔ ${err.message}`;
    }
    box.style.display = 'block';
  }

  // --- Écouteurs ---
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => showView(tab.dataset.tab));
  });

  $('admin-lab-search').addEventListener('input', renderLabList);
  $('admin-lab-filter-category').addEventListener('change', renderLabList);
  $('admin-lab-filter-difficulty').addEventListener('change', renderLabList);
  $('admin-lab-new-btn').addEventListener('click', () => openLabForm());
  $('admin-lab-list').addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = parseInt(btn.dataset.id, 10);
    if (btn.dataset.action === 'edit') {
      const lab = state.labs.find(l => l.id === id);
      if (lab) openLabForm(lab);
    } else if (btn.dataset.action === 'delete') {
      handleLabDelete(btn, id);
    }
  });
  $('admin-lab-save-btn').addEventListener('click', saveLabForm);
  $('admin-lab-cancel-btn').addEventListener('click', () => showView('labs'));
  $('admin-lab-try-btn').addEventListener('click', tryLabCommand);
  $('admin-lab-try-input').addEventListener('keydown', e => { if (e.key === 'Enter') tryLabCommand(); });

  $('admin-login-btn').addEventListener('click', tryLogin);
  $('admin-token-input').addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });

  $('admin-search-input').addEventListener('input', renderList);
  $('admin-filter-category').addEventListener('change', renderList);
  $('admin-filter-difficulty').addEventListener('change', renderList);
  $('admin-new-btn').addEventListener('click', () => openForm());

  $('admin-question-list').addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = parseInt(btn.dataset.id, 10);
    if (btn.dataset.action === 'edit') {
      const question = state.questions.find(q => q.id === id);
      if (question) openForm(question);
    } else if (btn.dataset.action === 'delete') {
      handleDelete(btn, id);
    }
  });

  $('admin-form-save-btn').addEventListener('click', saveForm);
  $('admin-form-cancel-btn').addEventListener('click', () => showView('list'));

  // --- Démarrage : reconnexion auto si un token est déjà en session ---
  (async function initSession() {
    if (!state.token) {
      showView('login');
      return;
    }
    try {
      await loadAll();
      initListView();
      initLabListView();
      showView('list');
    } catch (_) {
      logout();
    }
  })();
})();

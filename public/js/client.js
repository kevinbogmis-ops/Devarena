// ==========================================================================
// DEVARENA - CLIENT COMMON UTILITIES
// ==========================================================================

const AVATARS = ['👾', '🤖', '⚡', '💻', '🛡️', '🐳', '🚀', '🔥'];

function getAvatarEmoji(index) {
  return AVATARS[index % AVATARS.length] || '👾';
}

function escapeHtmlCommon(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Date courte d'une partie (ex : « 3 sept. 2026 ») — distingue les homonymes du Hall of Fame
function formatGameDate(isoDate) {
  if (!isoDate) return '';
  try {
    return new Date(isoDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (e) {
    return '';
  }
}

// Chargement et rendu du Hall of Fame (meilleurs scores all-time depuis la base).
// Inerte si l'élément #hall-of-fame n'est pas présent sur la page.
async function loadHallOfFame() {
  const container = document.getElementById('hall-of-fame');
  const list = document.getElementById('hall-of-fame-list');
  if (!container || !list) return;

  try {
    const res = await fetch('/api/scores/top?limit=10');
    if (!res.ok) return; // 503 = base indisponible : on masque simplement la section
    const { topScores } = await res.json();
    if (!Array.isArray(topScores) || topScores.length === 0) return;

    const medals = ['🥇', '🥈', '🥉'];
    list.innerHTML = topScores.map((s, idx) => `
      <div class="leaderboard-item">
        <div class="player-info">
          <span class="rank-badge top-${idx + 1}">${medals[idx] || '#' + (idx + 1)}</span>
          <span class="player-name">${escapeHtmlCommon(s.nickname)}</span>
        </div>
        <div style="text-align: right;">
          <span class="player-score">${s.score} pts</span>
          <div style="font-size: 0.72rem; color: var(--text-muted);">${s.total_correct}/${s.total_questions} bonnes${formatGameDate(s.played_at) ? ' · ' + formatGameDate(s.played_at) : ''}</div>
        </div>
      </div>
    `).join('');

    container.style.display = 'block';
  } catch (e) {
    /* réseau ou base indisponible : la section reste masquée */
  }
}

document.addEventListener('DOMContentLoaded', loadHallOfFame);

// Initialisation globale du bouton de son
document.addEventListener('DOMContentLoaded', () => {
  const soundBtn = document.getElementById('sound-toggle-btn');
  if (soundBtn && window.soundManager) {
    const updateSoundBtn = () => {
      const muted = window.soundManager.isMuted();
      soundBtn.textContent = muted ? '🔇 Son: OFF' : '🔊 Son: ON';
    };
    updateSoundBtn();

    soundBtn.addEventListener('click', () => {
      window.soundManager.toggleMute();
      updateSoundBtn();
      if (!window.soundManager.isMuted()) {
        window.soundManager.playClick();
      }
    });
  }
});

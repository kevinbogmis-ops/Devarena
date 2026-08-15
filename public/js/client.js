// ==========================================================================
// DEVARENA - CLIENT COMMON UTILITIES
// ==========================================================================

const AVATARS = ['👾', '🤖', '⚡', '💻', '🛡️', '🐳', '🚀', '🔥'];

function getAvatarEmoji(index) {
  return AVATARS[index % AVATARS.length] || '👾';
}

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

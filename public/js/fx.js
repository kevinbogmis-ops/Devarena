// ==========================================================================
// DEVARENA FX - Effets visuels "game feel" partagés (Host & Player)
// Machine à écrire, comptage animé des scores, cascade de classement,
// confettis canvas. Respecte prefers-reduced-motion.
// ==========================================================================

(function () {
  'use strict';

  const reducedMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- Effet machine à écrire (annule proprement l'effet précédent du même élément) ---
  const typewriterTimers = new WeakMap();

  function typewriter(el, text, totalMs = 700) {
    if (!el) return;
    const prev = typewriterTimers.get(el);
    if (prev) clearInterval(prev);

    if (reducedMotion || !text) {
      el.textContent = text || '';
      el.classList.remove('typing');
      return;
    }

    el.textContent = '';
    el.classList.add('typing');
    const stepMs = Math.max(8, totalMs / text.length);
    let i = 0;
    const interval = setInterval(() => {
      i++;
      el.textContent = text.slice(0, i);
      if (i >= text.length) {
        clearInterval(interval);
        typewriterTimers.delete(el);
        // Le curseur clignote encore un instant puis disparaît
        setTimeout(() => el.classList.remove('typing'), 900);
      }
    }, stepMs);
    typewriterTimers.set(el, interval);
  }

  // --- Comptage animé d'un nombre (score, points gagnés) ---
  function countUp(el, from, to, { duration = 900, prefix = '', suffix = '' } = {}) {
    if (!el) return;
    if (reducedMotion || from === to) {
      el.textContent = `${prefix}${to}${suffix}`;
      return;
    }
    const start = performance.now();
    el.classList.remove('score-pop');

    function frame(now) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const value = Math.round(from + (to - from) * eased);
      el.textContent = `${prefix}${value}${suffix}`;
      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        el.classList.add('score-pop');
      }
    }
    requestAnimationFrame(frame);
  }

  // --- Entrée en cascade des enfants d'une liste (classements) ---
  function staggerList(containerEl, stepMs = 70) {
    if (!containerEl || reducedMotion) return;
    Array.from(containerEl.children).forEach((child, idx) => {
      child.classList.add('stagger-in');
      child.style.animationDelay = `${idx * stepMs}ms`;
    });
  }

  // --- Confettis canvas (podium), sans bibliothèque ---
  function confetti({ durationMs = 3500, count = 140 } = {}) {
    if (reducedMotion) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'confetti-canvas';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const colors = ['#f85149', '#58a6ff', '#e3b341', '#3fb950', '#bc8cff', '#39c5cf'];
    const particles = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.5,
      w: 5 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      vy: 2 + Math.random() * 3.5,
      vx: -1.5 + Math.random() * 3,
      rot: Math.random() * Math.PI,
      vrot: -0.15 + Math.random() * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)]
    }));

    const startTime = performance.now();

    function frame(now) {
      const elapsed = now - startTime;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Fondu de sortie sur la dernière seconde
      ctx.globalAlpha = elapsed > durationMs - 1000
        ? Math.max(0, (durationMs - elapsed) / 1000)
        : 1;

      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;
        if (p.y > canvas.height + 20) {
          p.y = -20;
          p.x = Math.random() * canvas.width;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });

      if (elapsed < durationMs) {
        requestAnimationFrame(frame);
      } else {
        canvas.remove();
      }
    }
    requestAnimationFrame(frame);
  }

  window.fx = { typewriter, countUp, staggerList, confetti, reducedMotion };
})();

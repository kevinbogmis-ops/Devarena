// ==========================================================================
// LABS « TAPE LA COMMANDE » - chargement et vérification des réponses
// commands.json est la source de vérité. Les solutions ne quittent jamais le
// serveur (même principe anti-triche que le quiz) : le navigateur reçoit la
// mission et l'indice, et soumet sa commande à POST /api/labs/:id/check.
// ==========================================================================
const fs = require('fs');

const DIFFICULTIES = ['Débutant', 'Intermédiaire', 'Avancé', 'Expert'];
const MAX_ANSWER_LENGTH = 300;

// Mise en forme tolérante d'une commande, appliquée à la saisie ET aux
// réponses attendues : invite collée, guillemets, espaces multiples,
// point-virgule final et `sudo` ne changent pas le verdict.
function normalizeCommand(raw) {
  let s = String(raw ?? '').trim();
  s = s.replace(/^[$>]\s*/, '');
  s = s.replace(/["']/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/;$/, '').trim();
  s = s.replace(/^sudo /, '');
  return s;
}

function compileLab(lab) {
  return {
    ...lab,
    _accepted: new Set((lab.accepted || []).map(normalizeCommand)),
    _patterns: (lab.patterns || []).map(p => new RegExp(p))
  };
}

function loadLabs(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(raw)) throw new Error('commands.json doit contenir un tableau');
  return raw.map(compileLab);
}

function isAccepted(lab, answer) {
  const normalized = normalizeCommand(answer);
  if (!normalized) return false;
  if (lab._accepted.has(normalized) || normalizeCommand(lab.solution) === normalized) return true;
  return lab._patterns.some(re => re.test(normalized));
}

// Indice de proximité d'une mauvaise réponse, comparée à la solution :
// 'subcommand' = bon outil et bonne sous-commande, 'command' = bon outil seulement
function nearMiss(lab, answer) {
  const given = normalizeCommand(answer).split(' ');
  const expected = normalizeCommand(lab.solution).split(' ');
  if (!given[0] || given[0] !== expected[0]) return null;
  if (given.length > 1 && expected.length > 1 && given[1] === expected[1]) return 'subcommand';
  return 'command';
}

// Version envoyée au navigateur : sans solution, variantes ni explication
function publicLab(lab) {
  return {
    id: lab.id,
    category: lab.category,
    difficulty: lab.difficulty,
    mission: lab.mission,
    context: lab.context || null,
    hint: lab.hint
  };
}

module.exports = {
  DIFFICULTIES,
  MAX_ANSWER_LENGTH,
  normalizeCommand,
  loadLabs,
  isAccepted,
  nearMiss,
  publicLab
};

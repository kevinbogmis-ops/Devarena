const fs = require('fs');
const path = require('path');

console.log('=== [DEVARENA AUDIT & VALIDATION PRE-DEPLOY] ===\n');

let errors = [];
let warnings = [];

// 1. Validation de questions.json
console.log('1. Vérification de questions.json...');
try {
  const questionsRaw = fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8');
  const questions = JSON.parse(questionsRaw);

  if (!Array.isArray(questions)) {
    errors.push('questions.json ne contient pas un tableau JSON valide.');
  } else {
    console.log(`   ✓ Nombre total de questions : ${questions.length}`);
    if (questions.length < 30) {
      warnings.push(`Banque de questions réduite : ${questions.length} questions (minimum conseillé : 30)`);
    }

    // Vérification de l'équilibre des positions de bonne réponse (anti "toujours A")
    const answerDist = [0, 0, 0, 0];
    questions.forEach(q => {
      if (typeof q.correctIndex === 'number') answerDist[q.correctIndex]++;
    });
    const maxShare = Math.max(...answerDist) / questions.length;
    console.log(`   ✓ Répartition des bonnes réponses A/B/C/D : ${answerDist.join(' / ')}`);
    if (maxShare > 0.5) {
      warnings.push(`Déséquilibre des bonnes réponses : une position concentre ${Math.round(maxShare * 100)}% des réponses.`);
    }

    // Vérification des niveaux de difficulté autorisés
    const validLevels = ['Débutant', 'Intermédiaire', 'Avancé', 'Expert'];
    questions.forEach((q, idx) => {
      if (q.difficulty && !validLevels.includes(q.difficulty)) {
        warnings.push(`Question #${idx + 1} : difficulté "${q.difficulty}" hors échelle (${validLevels.join(', ')}).`);
      }
    });

    const categories = {};
    questions.forEach((q, idx) => {
      const qNum = idx + 1;
      if (!q.question || typeof q.question !== 'string') {
        errors.push(`Question #${qNum} : 'question' manquante ou invalide.`);
      }
      if (!Array.isArray(q.options) || q.options.length !== 4) {
        errors.push(`Question #${qNum} : 'options' doit comporter exactement 4 éléments (actuel: ${q.options?.length}).`);
      }
      if (typeof q.correctIndex !== 'number' || q.correctIndex < 0 || q.correctIndex > 3) {
        errors.push(`Question #${qNum} : 'correctIndex' (${q.correctIndex}) invalide (doit être entre 0 et 3).`);
      }
      if (typeof q.timeLimit !== 'number' || q.timeLimit <= 0) {
        errors.push(`Question #${qNum} : 'timeLimit' (${q.timeLimit}) invalide.`);
      }
      // Temps de réponse imposé par le niveau (même règle que l'éditeur admin)
      const expectedTime = { 'Débutant': 20, 'Intermédiaire': 25, 'Avancé': 30, 'Expert': 35 }[q.difficulty];
      if (expectedTime && q.timeLimit !== expectedTime) {
        errors.push(`Question #${q.id ?? qNum} : timeLimit ${q.timeLimit}s au lieu de ${expectedTime}s pour le niveau ${q.difficulty}.`);
      }
      if (!q.category) {
        warnings.push(`Question #${qNum} : 'category' absente.`);
      } else {
        categories[q.category] = (categories[q.category] || 0) + 1;
      }
    });

    console.log('   ✓ Répartition par catégorie :', categories);
  }
} catch (e) {
  errors.push(`Erreur de lecture/parsing de questions.json : ${e.message}`);
}

// 1bis. Validation de commands.json (labs « tape la commande »)
console.log('\n1bis. Vérification de commands.json...');
try {
  const labs = JSON.parse(fs.readFileSync(path.join(__dirname, 'commands.json'), 'utf8'));
  const css = fs.readFileSync(path.join(__dirname, 'public/css/style.css'), 'utf8');
  const validLevels = ['Débutant', 'Intermédiaire', 'Avancé', 'Expert'];
  const seenIds = new Set();
  const labCategories = {};

  if (!Array.isArray(labs)) {
    errors.push('commands.json ne contient pas un tableau JSON valide.');
  } else {
    labs.forEach((lab, idx) => {
      const ref = `Lab #${lab.id ?? idx + 1}`;
      if (!Number.isInteger(lab.id)) errors.push(`${ref} : 'id' entier manquant.`);
      if (seenIds.has(lab.id)) errors.push(`${ref} : 'id' en double.`);
      seenIds.add(lab.id);
      ['category', 'mission', 'solution', 'hint', 'explanation'].forEach(field => {
        if (typeof lab[field] !== 'string' || !lab[field].trim()) {
          errors.push(`${ref} : '${field}' manquant ou vide.`);
        }
      });
      if (!validLevels.includes(lab.difficulty)) {
        errors.push(`${ref} : difficulté "${lab.difficulty}" hors échelle (${validLevels.join(', ')}).`);
      }
      if (lab.ignoreCase !== undefined && typeof lab.ignoreCase !== 'boolean') {
        errors.push(`${ref} : 'ignoreCase' doit être un booléen.`);
      }
      if (lab.accepted !== undefined && (!Array.isArray(lab.accepted) || lab.accepted.some(a => typeof a !== 'string' || !a.trim()))) {
        errors.push(`${ref} : 'accepted' doit être un tableau de commandes non vides.`);
      }
      (lab.patterns || []).forEach(p => {
        if (typeof p !== 'string' || !p.startsWith('^') || !p.endsWith('$')) {
          errors.push(`${ref} : motif non ancré (doit commencer par ^ et finir par $) : ${p}`);
        }
        try { new RegExp(p); } catch (e) { errors.push(`${ref} : motif invalide (${e.message}).`); }
      });
      if (lab.category && !css.includes(`.badge-${lab.category.toLowerCase()}`)) {
        warnings.push(`${ref} : pas de style .badge-${lab.category.toLowerCase()} dans style.css.`);
      }
      labCategories[lab.category] = (labCategories[lab.category] || 0) + 1;
    });
    console.log(`   ✓ ${labs.length} labs de commandes :`, labCategories);
  }
} catch (e) {
  errors.push(`Erreur de lecture/parsing de commands.json : ${e.message}`);
}

// 2. Validation des fichiers statiques & HTML
console.log('\n2. Vérification des fichiers du Frontend...');
const requiredFiles = [
  'public/index.html',
  'public/host.html',
  'public/player.html',
  'public/admin.html',
  'public/labs.html',
  'public/revision.html',
  'public/css/style.css',
  'public/js/sound.js',
  'public/js/fx.js',
  'public/js/client.js',
  'public/js/qrcode.js',
  'public/js/host.js',
  'public/js/player.js',
  'public/js/admin.js',
  'public/js/labs.js',
  'public/js/revision.js',
  'command-labs.js',
  'commands.json',
  'Dockerfile',
  '.dockerignore',
  'package.json',
  'server.js'
];

requiredFiles.forEach(file => {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    const stat = fs.statSync(fullPath);
    console.log(`   ✓ ${file} présent (${stat.size} octets)`);
  } else {
    errors.push(`Fichier manquant : ${file}`);
  }
});

// 3. Vérification des balises script et liens CSS dans les HTML
console.log('\n3. Cohérence des imports dans les fichiers HTML...');
const httpOnlyPages = ['public/admin.html', 'public/labs.html', 'public/revision.html'];
['public/index.html', 'public/host.html', 'public/player.html', ...httpOnlyPages].forEach(htmlFile => {
  const content = fs.readFileSync(path.join(__dirname, htmlFile), 'utf8');
  if (!content.includes('css/style.css')) {
    warnings.push(`${htmlFile} ne semble pas lier css/style.css`);
  }
  // Les pages admin et labs sont purement HTTP (API REST), pas de temps réel
  if (!httpOnlyPages.includes(htmlFile) && !content.includes('/socket.io/socket.io.js')) {
    warnings.push(`${htmlFile} ne charge pas le client Socket.io`);
  }

  // Équilibre des balises structurantes (une section non fermée avale les éléments
  // suivants dans un conteneur potentiellement masqué -> bugs d'affichage invisibles)
  ['section', 'div'].forEach(tag => {
    const opened = (content.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length;
    const closed = (content.match(new RegExp(`</${tag}>`, 'g')) || []).length;
    if (opened !== closed) {
      errors.push(`${htmlFile} : balises <${tag}> déséquilibrées (${opened} ouvertes / ${closed} fermées).`);
    }
  });
});

// 4. Synthèse
console.log('\n=============================================');
if (errors.length === 0) {
  console.log('✅ TOUS LES TESTS SONT AU VERT ! PRÊT POUR LE DÉPLOIEMENT.');
} else {
  console.log(`❌ ${errors.length} ERREUR(S) DÉTECTÉE(S) :`);
  errors.forEach(err => console.log(`   - ${err}`));
}

if (warnings.length > 0) {
  console.log(`⚠️ ${warnings.length} Avertissement(s) :`);
  warnings.forEach(w => console.log(`   - ${w}`));
}
console.log('=============================================\n');

if (errors.length > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

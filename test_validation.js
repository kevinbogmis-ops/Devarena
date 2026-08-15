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
    if (questions.length !== 30) {
      warnings.push(`Attendu 30 questions, trouvé ${questions.length}`);
    }

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

// 2. Validation des fichiers statiques & HTML
console.log('\n2. Vérification des fichiers du Frontend...');
const requiredFiles = [
  'public/index.html',
  'public/host.html',
  'public/player.html',
  'public/css/style.css',
  'public/js/sound.js',
  'public/js/client.js',
  'public/js/qrcode.js',
  'public/js/host.js',
  'public/js/player.js',
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
['public/index.html', 'public/host.html', 'public/player.html'].forEach(htmlFile => {
  const content = fs.readFileSync(path.join(__dirname, htmlFile), 'utf8');
  if (!content.includes('css/style.css')) {
    warnings.push(`${htmlFile} ne semble pas lier css/style.css`);
  }
  if (!content.includes('/socket.io/socket.io.js')) {
    warnings.push(`${htmlFile} ne charge pas le client Socket.io`);
  }
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

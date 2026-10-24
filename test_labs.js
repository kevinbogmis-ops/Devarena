// Test des labs « tape la commande » : tolérance de la vérification
// (variantes acceptées / refusées), indices de proximité, et API HTTP
// (aucune solution envoyée au navigateur, vérification, révélation, erreurs).
// Mode fichier forcé via une DATABASE_URL injoignable.
const path = require('path');
const commandLabs = require('./command-labs');

const PORT = 3096;
process.env.PORT = String(PORT);
process.env.DATABASE_URL = 'postgresql://devarena:devarena@127.0.0.1:59999/devarena';

require('./server.js');
const BASE = `http://localhost:${PORT}`;

console.log('=== [DEVARENA TEST DES LABS COMMANDES] ===\n');

const watchdog = setTimeout(() => {
  console.error('❌ TIMEOUT : le scénario des labs ne s\'est pas terminé en 20s.');
  process.exit(1);
}, 20000);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Variantes qui DOIVENT être acceptées (en plus de la solution officielle)
const ACCEPTED = {
  1: ['docker ps --all', 'docker container ls -a', '$ docker ps -a', 'sudo docker ps -a', '  docker   ps  -a ;'],
  2: ['docker image pull nginx:1.27'],
  3: ['docker run -p 8080:80 -d nginx', 'docker run --detach --publish=8080:80 nginx', 'docker container run -d -p 8080:80 nginx:latest', 'docker run -dp 8080:80 nginx'],
  4: ['docker logs web --follow', 'docker container logs -f web'],
  5: ['docker exec -ti api /bin/bash', 'docker exec -i -t api bash'],
  6: ['docker build . -t monapp:1.0', 'docker buildx build --tag=monapp:1.0 .'],
  7: ['docker container stats --no-stream'],
  8: ['kubectl get po -A', 'kubectl get --all-namespaces pods'],
  9: ['kubectl describe po/web-7f9c', 'kubectl describe pods web-7f9c'],
  10: ['kubectl apply --filename=deploy.yaml'],
  11: ['kubectl scale deploy/api --replicas 5', 'kubectl scale --replicas=5 deployment api'],
  12: ['kubectl logs -p api-0', 'kubectl logs pod/api-0 --previous'],
  13: ['kubectl port-forward service/web 8080:80'],
  14: ['kubectl rollout undo deploy api'],
  15: ['git status -s'],
  16: ['git checkout -b feature/login'],
  17: ['git log --all --graph --oneline'],
  18: ['git reset HEAD config.yml'],
  19: ['git stash push --include-untracked'],
  20: ['git revert --no-edit HEAD'],
  21: ['ls -al', 'ls -lah', 'ls -a -l', 'ls -lA'],
  22: ['chmod u+x deploy.sh'],
  23: ['grep -rn error /var/log', 'grep -R error /var/log/', 'grep error -r /var/log', 'grep -r "error" /var/log'],
  24: ['tail -f -n 50 /var/log/syslog', 'tail -fn 50 /var/log/syslog', 'tail -n50 -F /var/log/syslog', 'tail -50f /var/log/syslog'],
  25: ['sudo systemctl restart nginx.service'],
  26: ['ss -lntp', 'netstat -plnt'],
  27: ['find /var -size +100M -type f', 'find /var -size +100M'],
  28: ['du -h -d 1 /home', 'du -sh /home/*', 'du -hd1 /home'],
  31: ['terraform apply --auto-approve'],
  32: ['terraform fmt --recursive'],
  35: ['ansible -i hosts.ini all -m ping', 'ansible all -m ping --inventory hosts.ini'],
  36: ['ansible-playbook -C site.yml'],
  37: ['ansible-playbook --syntax-check site.yml'],
  38: ['ping 8.8.8.8 -c 4', 'ping -c4 8.8.8.8'],
  39: ['ip addr show'],
  40: ['route -n', 'ip r'],
  41: ['dig example.com MX @1.1.1.1', 'dig @1.1.1.1 -t mx example.com'],
  42: ['sh ip int br', 'show ip int brief'],
  43: ['copy run start', 'wr', 'write memory'],
  45: ['aws s3 ls s3://mon-bucket/']
};

// Réponses fausses qui DOIVENT être refusées
const REJECTED = {
  1: ['docker ps', 'docker images'],
  3: ['docker run -p 80:8080 -d nginx', 'docker run -d nginx'],
  5: ['docker run -it api bash', 'docker exec api bash'],
  8: ['kubectl get pods'],
  17: ['git log --oneline --graph'],
  18: ['git rm --cached config.yml'],
  20: ['git reset --hard HEAD~1'],
  21: ['ls -l', 'ls -a'],
  26: ['ss -tln'],
  27: ['find /var -size 100M'],
  35: ['ansible all -m ping'],
  38: ['ping 8.8.8.8'],
  43: ['copy start run'],
  45: ['aws s3 ls mon-bucket']
};

async function post(urlPath, body) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  let json = {};
  try { json = await res.json(); } catch (_) { /* réponse vide */ }
  return { status: res.status, json };
}

async function run() {
  await new Promise(r => setTimeout(r, 800));

  // 1. Vérification locale des variantes
  const labs = commandLabs.loadLabs(path.join(__dirname, 'commands.json'));
  const byId = Object.fromEntries(labs.map(l => [l.id, l]));
  let accepted = 0;
  let rejected = 0;
  for (const [id, answers] of Object.entries(ACCEPTED)) {
    assert(byId[id], `Lab ${id} absent de commands.json`);
    for (const a of answers) {
      assert(commandLabs.isAccepted(byId[id], a), `Lab ${id} : « ${a} » devrait être acceptée`);
      accepted++;
    }
  }
  for (const [id, answers] of Object.entries(REJECTED)) {
    for (const a of answers) {
      assert(!commandLabs.isAccepted(byId[id], a), `Lab ${id} : « ${a} » devrait être refusée`);
      rejected++;
    }
  }
  console.log(`1. ✓ Tolérance de la vérification : ${accepted} variantes acceptées, ${rejected} erreurs refusées`);

  assert(commandLabs.nearMiss(byId[1], 'docker ps') === 'subcommand', 'nearMiss attendu : subcommand');
  assert(commandLabs.nearMiss(byId[5], 'docker run -it api bash') === 'command', 'nearMiss attendu : command');
  assert(commandLabs.nearMiss(byId[22], 'rm -rf /') === null, 'nearMiss attendu : null');
  console.log('2. ✓ Indices de proximité : bonne sous-commande / bon outil / hors sujet');

  // 3. L'API ne divulgue aucune solution
  const listRes = await fetch(`${BASE}/api/labs`);
  const { labs: publicLabs } = await listRes.json();
  assert(listRes.status === 200 && publicLabs.length === labs.length, 'Liste des labs incomplète');
  const leaked = publicLabs.filter(l => 'solution' in l || 'accepted' in l || 'patterns' in l || 'explanation' in l);
  assert(leaked.length === 0, `${leaked.length} lab(s) exposent leur solution`);
  assert(publicLabs.every(l => l.mission && l.hint && l.category && l.difficulty), 'Champs publics manquants');
  console.log(`3. ✓ GET /api/labs : ${publicLabs.length} labs, aucune solution envoyée au navigateur`);

  // 4. La solution officielle de chaque lab est acceptée par l'API
  for (const lab of labs) {
    const { status, json } = await post(`/api/labs/${lab.id}/check`, { answer: lab.solution });
    assert(status === 200 && json.correct === true, `Lab ${lab.id} : sa propre solution est refusée`);
    assert(json.explanation && json.solution === lab.solution, `Lab ${lab.id} : explication manquante`);
  }
  console.log(`4. ✓ Les ${labs.length} solutions officielles sont acceptées (avec explication)`);

  // 5. Mauvaise réponse : pas de solution divulguée, indice de proximité
  const wrong = await post('/api/labs/1/check', { answer: 'docker ps' });
  assert(wrong.status === 200 && wrong.json.correct === false, 'Mauvaise réponse acceptée');
  assert(wrong.json.near === 'subcommand' && !('solution' in wrong.json), 'Réponse fausse : proximité absente ou solution divulguée');
  console.log('5. ✓ Mauvaise réponse : refusée, sans solution, avec indice de proximité');

  // 6. Révélation volontaire de la solution
  const reveal = await post('/api/labs/3/reveal');
  assert(reveal.status === 200 && reveal.json.solution === byId[3].solution && reveal.json.explanation, 'Révélation incorrecte');
  console.log('6. ✓ POST /reveal : solution et explication renvoyées');

  // 7. Cas d'erreur
  assert((await post('/api/labs/9999/check', { answer: 'ls' })).status === 404, 'Lab inexistant : 404 attendu');
  assert((await post('/api/labs/1/check', { answer: '   ' })).status === 400, 'Commande vide : 400 attendu');
  assert((await post('/api/labs/1/check', {})).status === 400, 'Sans réponse : 400 attendu');
  assert((await post('/api/labs/1/check', { answer: 'x'.repeat(301) })).status === 400, 'Commande trop longue : 400 attendu');
  console.log('7. ✓ Erreurs : 404 lab inexistant, 400 commande vide / absente / trop longue');

  console.log('\n✅ LABS COMMANDES VALIDÉS : VARIANTES, ANTI-TRICHE, API ET ERREURS !');
}

run()
  .then(() => {
    clearTimeout(watchdog);
    process.exit(0);
  })
  .catch(err => {
    console.error(`\n❌ ÉCHEC : ${err.message}`);
    process.exit(1);
  });

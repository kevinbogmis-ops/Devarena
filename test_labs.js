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
  45: ['aws s3 ls s3://mon-bucket/'],
  // Cisco insensible à la casse
  42: ['sh ip int br', 'show ip int brief', 'SH IP INT BR'],
  43: ['copy run start', 'wr', 'write memory', 'COPY RUN START'],
  // Labs ajoutés (Expert, Cisco, AWS, Ansible, Supabase)
  46: ['docker buildx build --platform=linux/arm64,linux/amd64 --push -t registry.example.com/monapp:1.0 .', 'docker buildx build . --push --tag registry.example.com/monapp:1.0 --platform linux/amd64,linux/arm64'],
  47: ['kubectl drain node/worker-2 --ignore-daemonsets --delete-emptydir-data', 'kubectl drain --ignore-daemonsets worker-2'],
  48: ['git rebase --interactive HEAD~3', 'git rebase -i @~3'],
  49: ['journalctl -f -b -u nginx.service', 'journalctl --unit=nginx --boot --follow'],
  50: ['terraform apply -replace aws_instance.web', 'terraform apply --replace=aws_instance.web'],
  51: ['traceroute 8.8.8.8 -n', 'tracepath -n 8.8.8.8'],
  52: ['en', 'ENABLE', 'ena'],
  53: ['int g0/1', 'INT Gi0/1', 'interface gigabitethernet 0/1'],
  54: ['ip add 192.168.1.1 255.255.255.0', 'IP ADDRESS 192.168.1.1 255.255.255.0'],
  55: ['IP ROUTE 0.0.0.0 0.0.0.0 203.0.113.1'],
  56: ['aws s3 cp ./rapport.pdf s3://mon-bucket', 'aws s3 cp rapport.pdf s3://mon-bucket/rapport.pdf'],
  57: ['aws --region eu-west-3 ec2 describe-instances', 'aws ec2 describe-instances --region=eu-west-3'],
  58: ['aws s3 sync site s3://mon-site/ --delete', 'aws s3 sync --delete ./site/ s3://mon-site'],
  59: ['aws sts assume-role --role-session-name audit --role-arn arn:aws:iam::123456789012:role/Admin'],
  61: ['ansible-playbook -l web1 -t nginx site.yml', 'ansible-playbook site.yml --tags=nginx --limit=web1'],
  62: ['ansible-inventory --host web1 -i hosts.ini', 'ansible-inventory --inventory=hosts.ini --host=web1'],
  63: ['npx supabase start'],
  64: ['npx supabase migration new add_profiles'],
  65: ['npx supabase db push']
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
  45: ['aws s3 ls mon-bucket'],
  46: ['docker build -t registry.example.com/monapp:1.0 .', 'docker buildx build --platform linux/amd64,linux/arm64 -t registry.example.com/monapp:1.0 .'],
  47: ['kubectl drain worker-2', 'kubectl cordon worker-2'],
  48: ['git rebase HEAD~3', 'git reset --soft HEAD~3'],
  49: ['journalctl -u nginx -f', 'tail -f /var/log/nginx/error.log'],
  50: ['terraform taint aws_instance.web', 'terraform apply -target=aws_instance.web'],
  51: ['traceroute 8.8.8.8', 'ping -c 4 8.8.8.8'],
  52: ['e', 'configure terminal'],
  53: ['int g0/2', 'interface fa0/1'],
  54: ['ip address 192.168.1.1/24', 'ip address 192.168.1.1 255.255.0.0'],
  55: ['ip route 0.0.0.0 255.255.255.255 203.0.113.1', 'ip default-gateway 203.0.113.1'],
  56: ['aws s3 cp s3://mon-bucket rapport.pdf', 'aws s3 mv rapport.pdf s3://mon-bucket/'],
  57: ['aws ec2 describe-instances', 'aws ec2 describe-instances --region eu-west-1'],
  58: ['aws s3 sync ./site s3://mon-site', 'aws s3 cp ./site s3://mon-site --recursive'],
  59: ['aws sts assume-role --role-arn arn:aws:iam::123456789012:role/Admin', 'aws sts get-caller-identity'],
  60: ['ansible-vault decrypt secrets.yml', 'ansible-vault create secrets.yml'],
  61: ['ansible-playbook site.yml --limit web1', 'ansible-playbook site.yml --skip-tags nginx --limit web1'],
  62: ['ansible-inventory -i hosts.ini --list', 'ansible web1 -i hosts.ini -m setup'],
  63: ['supabase stop', 'docker compose up'],
  64: ['supabase migration new', 'supabase db diff'],
  65: ['supabase db pull', 'supabase db reset']
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

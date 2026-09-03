// ==========================================================================
// DEVARENA - MODULE BASE DE DONNÉES (PostgreSQL)
// Connexion, création du schéma, seed des questions et persistance des parties.
// ==========================================================================

const { Pool } = require('pg');

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://devarena:devarena@localhost:5432/devarena';

const pool = new Pool({
  connectionString: DATABASE_URL,
  connectionTimeoutMillis: 5000
});

// Création des tables si elles n'existent pas encore
async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS questions (
      id            INTEGER PRIMARY KEY,
      category      TEXT NOT NULL,
      difficulty    TEXT,
      question      TEXT NOT NULL,
      code_snippet  TEXT,
      options       JSONB NOT NULL,
      correct_index INTEGER NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
      time_limit    INTEGER NOT NULL DEFAULT 20,
      explanation   TEXT
    );

    CREATE TABLE IF NOT EXISTS games (
      id              SERIAL PRIMARY KEY,
      pin             TEXT NOT NULL,
      played_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      total_questions INTEGER NOT NULL,
      player_count    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS game_players (
      id            SERIAL PRIMARY KEY,
      game_id       INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      nickname      TEXT NOT NULL,
      score         INTEGER NOT NULL,
      total_correct INTEGER NOT NULL DEFAULT 0,
      rank          INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_game_players_score ON game_players (score DESC);
  `);
}

// Seed idempotent : questions.json reste la source de vérité.
// Un upsert par question -> toute modification du JSON est répercutée au démarrage.
async function seedQuestions(questions) {
  if (!Array.isArray(questions) || questions.length === 0) return 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const q of questions) {
      await client.query(
        `INSERT INTO questions
           (id, category, difficulty, question, code_snippet, options, correct_index, time_limit, explanation)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           category      = EXCLUDED.category,
           difficulty    = EXCLUDED.difficulty,
           question      = EXCLUDED.question,
           code_snippet  = EXCLUDED.code_snippet,
           options       = EXCLUDED.options,
           correct_index = EXCLUDED.correct_index,
           time_limit    = EXCLUDED.time_limit,
           explanation   = EXCLUDED.explanation`,
        [
          q.id,
          q.category,
          q.difficulty || null,
          q.question,
          q.codeSnippet || null,
          JSON.stringify(q.options),
          q.correctIndex,
          q.timeLimit || 20,
          q.explanation || null
        ]
      );
    }
    await client.query('COMMIT');
    return questions.length;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Chargement des questions au format attendu par le moteur de jeu
// (mêmes clés camelCase que questions.json)
async function loadQuestions() {
  const res = await pool.query(
    `SELECT id, category, difficulty, question, code_snippet, options,
            correct_index, time_limit, explanation
     FROM questions
     ORDER BY id`
  );
  return res.rows.map(row => ({
    id: row.id,
    category: row.category,
    difficulty: row.difficulty,
    question: row.question,
    codeSnippet: row.code_snippet,
    options: row.options,
    correctIndex: row.correct_index,
    timeLimit: row.time_limit,
    explanation: row.explanation
  }));
}

// Suppression d'une question (utilisée par l'éditeur admin ; le re-seed upsert
// ne retire jamais de lignes, la suppression doit donc être explicite)
async function deleteQuestion(id) {
  await pool.query('DELETE FROM questions WHERE id = $1', [id]);
}

// Enregistrement d'une partie terminée et de son classement final
async function saveGameResults(pin, finalRanking, totalQuestions) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const gameRes = await client.query(
      `INSERT INTO games (pin, total_questions, player_count)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [pin, totalQuestions, finalRanking.length]
    );
    const gameId = gameRes.rows[0].id;

    for (const p of finalRanking) {
      await client.query(
        `INSERT INTO game_players (game_id, nickname, score, total_correct, rank)
         VALUES ($1, $2, $3, $4, $5)`,
        [gameId, p.nickname, p.score, p.totalCorrect, p.rank]
      );
    }
    await client.query('COMMIT');
    return gameId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Top scores globaux (meilleurs scores sur une partie, toutes sessions confondues)
async function getTopScores(limit = 10) {
  const res = await pool.query(
    `SELECT gp.nickname, gp.score, gp.total_correct, g.played_at, g.total_questions
     FROM game_players gp
     JOIN games g ON g.id = gp.game_id
     ORDER BY gp.score DESC
     LIMIT $1`,
    [limit]
  );
  return res.rows;
}

// Initialisation complète avec quelques tentatives (utile si la base démarre en même temps)
async function init(retries = 3, delayMs = 2000) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await initSchema();
      return;
    } catch (err) {
      lastErr = err;
      console.warn(`[DB] Tentative ${attempt}/${retries} échouée : ${err.message}`);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
}

module.exports = {
  pool,
  init,
  seedQuestions,
  loadQuestions,
  deleteQuestion,
  saveGameResults,
  getTopScores
};

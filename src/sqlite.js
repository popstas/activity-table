const fs = require('fs');
const path = require('path');
let Database;

try {
	// lazy require to avoid crashing if not installed yet
	Database = require('better-sqlite3');
} catch (e) {
	Database = null;
}

let dbInstance = null;

function getDbPath() {
	const dataDir = path.join(process.cwd(), 'data');
	if (!fs.existsSync(dataDir)) {
		fs.mkdirSync(dataDir, { recursive: true });
	}
	return path.join(dataDir, 'activity.sqlite');
}

function getDb() {
	if (!Database) {
		throw new Error('better-sqlite3 is not installed. Run: npm i better-sqlite3');
	}
	if (!dbInstance) {
		dbInstance = new Database(getDbPath());
		dbInstance.pragma('journal_mode = WAL');
		initSchema(dbInstance);
	}
	return dbInstance;
}

function initSchema(db) {
	db.exec(`
		CREATE TABLE IF NOT EXISTS items (
			date TEXT NOT NULL,
			indicator TEXT NOT NULL,
			value REAL,
			tags TEXT,
			PRIMARY KEY (date, indicator)
		);
	`);
}

/**
 * Upsert an array of items into SQLite.
 * Each item: { date: string, indicator: string, value: number|string, tags?: string[] }
 */
function upsertItems(items) {
	if (!items || items.length === 0) return;
	const db = getDb();
	const insert = db.prepare(`
		INSERT INTO items (date, indicator, value, tags)
		VALUES (@date, @indicator, @value, @tags)
		ON CONFLICT(date, indicator) DO UPDATE SET
			value=excluded.value,
			tags=excluded.tags
	`);
	const tx = db.transaction((rows) => {
		for (const m of rows) {
			const value = m.value === null || m.value === undefined ? null : Number(m.value);
			const tags = Array.isArray(m.tags) ? JSON.stringify(m.tags) : (m.tags ? JSON.stringify(m.tags) : null);
			insert.run({
				date: m.date,
				indicator: m.indicator,
				value,
				tags,
			});
		}
	});
	tx(items);
}

/**
 * Returns description of the SQLite schema.
 */
function getSchemaDescription() {
	return {
		table: 'items',
		columns: [
			{ name: 'date', type: 'TEXT', description: 'Дата в формате YYYY-MM-DD. Часть первичного ключа.' },
			{ name: 'indicator', type: 'TEXT', description: 'Имя метрики (индикатора). Часть первичного ключа.' },
			{ name: 'value', type: 'REAL', description: 'Числовое значение метрики за дату.' },
			{ name: 'tags', type: 'TEXT', description: 'JSON-массив строк с тегами (или NULL).' },
		],
		primaryKey: ['date', 'indicator'],
		path: getDbPath(),
	};
}

module.exports = {
	getDb,
	upsertItems,
	getSchemaDescription,
};



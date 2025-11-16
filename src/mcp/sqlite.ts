import path from 'path';
import fs from 'fs';

// Use require since better-sqlite3 has CJS typings commonly
// eslint-disable-next-line @typescript-eslint/no-var-requires
let Database: any;
try {
	// lazy import to avoid crash if not installed yet
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	Database = require('better-sqlite3');
} catch (e) {
	Database = null;
}

let dbInstance: any = null;

function getDbPath(): string {
	const dataDir = path.join(process.cwd(), 'data');
	if (!fs.existsSync(dataDir)) {
		fs.mkdirSync(dataDir, { recursive: true });
	}
	return path.join(dataDir, 'activity.sqlite');
}

export function getDb(): any {
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

function initSchema(db: any) {
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

export function getSchemaDescription() {
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

export function all(sql: string, params: any[] = []) {
	const db = getDb();
	const stmt = db.prepare(sql);
	return stmt.all(...params);
}



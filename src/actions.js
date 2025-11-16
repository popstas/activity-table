// const axios = require('axios');
const gs = require('google-spreadsheet');
const GoogleSpreadsheet = gs.GoogleSpreadsheet || gs.default || gs;
const { format } = require('date-fns');
const fs = require('fs');
process.env.DEBUG = 'influx*';
const Influx = require('influx');
const ical = require('ical-generator');

const config = require('../config');
// const packageJson = require('../package.json');
const { getSheetNameByDate } = require('./utils');
const sqlite = require('./sqlite');

const low = require('lowdb');

const excludedIndicators = [];

const dateRowNum = 0;
const indicatorColNum = 1;
const maxRowNum = 45;
const maxColNum = 35;
let tagsColNum = 34;

const pointsLimit = 10000;



async function authDoc(doc) {
  if (typeof doc.useServiceAccountAuth === 'function') {
    await doc.useServiceAccountAuth({
      client_email: config.client_email,
      private_key: config.private_key,
    });
    return;
  }
  // Newer versions: set auth request hook with OAuth2 bearer token
  if (typeof doc._setAuthRequestHook === 'function') {
    const { JWT } = require('google-auth-library');
    const scopes = [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ];
    const client = new JWT({
      email: config.client_email,
      key: config.private_key,
      scopes,
    });
    // google-spreadsheet accepts an auth object with getRequestHeaders
    const auth = {
      async getRequestHeaders() {
        return await client.getRequestHeaders();
      }
    };
    doc._setAuthRequestHook(auth);
    return;
  }
  throw new Error('GoogleSpreadsheet auth method not found (useServiceAccountAuth/_setAuthRequestHook). Check google-spreadsheet version.');
}

async function loadSheet(sheetName) {
  // load doc, sheet, rows
  let doc;
  // Newer API authenticates via constructor
  if (typeof GoogleSpreadsheet === 'function' && GoogleSpreadsheet.prototype && typeof GoogleSpreadsheet.prototype._setAuthRequestHook === 'function') {
    const { JWT } = require('google-auth-library');
    const scopes = [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ];
    const client = new JWT({
      email: config.client_email,
      key: config.private_key,
      scopes,
    });
    doc = new GoogleSpreadsheet(config.sheetId, client);
  } else {
    // Legacy API path
    doc = new GoogleSpreadsheet(config.sheetId);
    await authDoc(doc);
  }
  await doc.loadInfo();

  const sheet = doc.sheetsByTitle[sheetName]; // or use doc.sheetsById[id] or doc.sheetsByTitle[title]
  console.log('sheetName: ', sheetName);
  // const rows = await sheet.getRows();
  await sheet.loadCells({
    startRowIndex: 0,
    startColumnIndex: 0,
    endRowIndex: maxRowNum + 10,
    endColumnIndex: maxColNum + 10,
  });

  return sheet;
}

async function processMonthSheet({ sheetName }) {
  // console.log('sheetName: ' + sheetName);

  const sheet = await loadSheet(sheetName);
  console.log('sheet loaded');

  const metrics = [];

  // перебираем колонки дат
  for (let colNum = indicatorColNum + 1; colNum < sheet.columnCount; colNum++) {
    // console.log(`${dateRowNum}, ${colNum}`);
    const dateCell = sheet.getCell(dateRowNum, colNum);
    if (!dateCell.value) continue;

    if (dateCell.value == 'Теги') {
      console.log('tagsColNum:', colNum);
      tagsColNum = colNum;
      continue;
    }

    // console.log('dateCell.value: ', dateCell.value);
    const fromDate = new Date('1899-12-30T00:00:00');
    const delta = parseInt(dateCell.value) * 1000 * 86400;
    const d = new Date(fromDate.getTime() + delta);

    let currentDate;
    try {
      currentDate = format(d, 'yyyy-MM-dd');
    }
    catch(e) {
      console.log(`${dateCell.value} is not date`);
    }
    if (!currentDate) continue;

    // get indicators for a day
    const maxRow = Math.min(sheet.rowCount, maxRowNum + 10);
    for (let rowNum = dateRowNum + 1; rowNum < maxRow; rowNum++) {
      const m = { date: currentDate };
      // console.log(`sheet.getCell(${rowNum}, ${indicatorColNum})`);
      const indicatorCell = sheet.getCell(rowNum, indicatorColNum);
      m.indicator = indicatorCell.value;
      
      const cell = sheet.getCell(rowNum, colNum);
      m.value = cell.value;

      if (m.value === null) continue;

      if (!m.indicator) continue;

      if (excludedIndicators.includes(m.indicator)) continue;

      m.tags = sheet.getCell(rowNum, tagsColNum)
        ?.value;
      if (typeof m.tags === 'string') m.tags = m.tags
        .split(',')
        .map(tag => tag?.trim())
        .filter(Boolean) || [];

      // console.log('m.tags: ', m.tags);
      
      console.log(`${m.date} ${m.indicator}: ${m.value}`);

      metrics.push(m);

    }
  }

  // await sheet.loadCells(todayRow.a1Range);
  // const moneyCell = sheet.getCell(rowNum, moneyColNum);
  // const commentCell = sheet.getCell(rowNum, commentColNum);

  return metrics;
}

function writeToTxt(data, filePath) {
  const rows = [];
  for (let m of data) {
    rows.push(`${m.date}\t${m.indicator}\t${m.value}`);
  }
  fs.appendFileSync(filePath, rows.join('\n')+'\n');
  console.log(`saved to ${filePath}`);
}

// items.json to items-gpt.json
async function itemsToDataGpt() {
  const items = JSON.parse(fs.readFileSync('data/items.json', 'utf-8'));
  const metrics = {};
  for (let item of items) {
    // if (!item.date.includes('2023')) continue;
    if (!metrics[item.indicator]) metrics[item.indicator] = {};
    metrics[item.indicator][item.date] = item.value;
    // if (!metrics[item.indicator]) metrics[item.indicator] = [];
    // metrics[item.indicator].push(item.value);
  }
  return metrics;
}

// sheets to data.txt
async function sheetsToData(sheetNames, saveTo=null) {
  const items = saveTo ? JSON.parse(fs.readFileSync('data/items.json', 'utf-8')) : [];
  for (let sheetName of sheetNames) {
    console.log('month: ', sheetName);
    const data = await processMonthSheet({ sheetName });

    for (let newItem of data) {
      const found = items.find(item => {
        return item.date == newItem.date &&
          item.indicator == newItem.indicator
      });
      if (found) {
        Object.assign(found, newItem);
      } else {
        items.push(newItem);
      }
    }
  
    // items.push(...data);
    // console.log('data: ', data);

    if (saveTo) {
      // save to json
      fs.writeFileSync(saveTo, JSON.stringify(items));
      console.log (`${sheetName} saved to ${saveTo}`);
      console.log('total items: ', items.length);
      try {
        sqlite.upsertItems(items);
        console.log('items mirrored to SQLite');
      } catch (e) {
        console.log('SQLite mirror error: ', e?.message || e);
      }
    }
    // writeToTxt(data, `data/${sheetName}.txt`);
    writeToTxt(data, `data/data.txt`);
  }

  return items;
}

function initInflux(options) {
  const influx = new Influx.InfluxDB({
   host: options.influxdb.host,
   port: options.influxdb.port,
   database: options.influxdb.database,
   schema: options.influxdb.schema,
   username: options.influxdb.username,
   password: options.influxdb.password,
  });

  return influx;
}

async function getPoint(item, schema) {
  let d = new Date(`${item.date}T00:00:00`);
  let tags = { indicator: item.indicator };
  // if (item.tags) tags = { ...tags, ...item.tags };

  const point = {
    measurement: schema.measurement,
    tags,
    fields: {},
    timestamp: d,
  }

  for (let fieldName in schema.fields) {
    let val = item[fieldName];
    if (fieldName == 'value') val = parseInt(val);
    if (val !== undefined && val !== null) {
      point.fields[fieldName] = val;
    }
  }

  // console.log('point: ', point);
  return point;
}

// not used
async function dataSheetToMetrics() {
  const metrics = [];

  const doc = new GoogleSpreadsheet(config.sheetId);
  await doc.useServiceAccountAuth(config);
  await doc.loadInfo();

  const sheet = doc.sheetsByTitle[config.allSheetName]; // or use doc.sheetsById[id] or doc.sheetsByTitle[title]
  const rows = await sheet.getRows();

  for (let row of rows) {
    const m = {
      date: row['Дата'],
      indicator: row['Индикатор'],
      value: row['Значение'],
    }
    metrics.push(m);
  }

  return metrics;
}

async function initDb() {
  const FileSync = require('lowdb/adapters/FileSync');
  const adapter = new FileSync('data/db.json');
  const db = low(adapter);
  db.defaults({ metrics: [] }).write();
  return db;
}

async function sendToInflux(metrics, resend = false) {
  const influx = initInflux(config);
  // const hosts = await influx.ping(5000);
  // console.log(hosts);
  const db = await initDb();

  const points = [];

  for (let m of metrics) {
    const search = { date: m.date, indicator: m.indicator };
    const foundRow = db.get('metrics').find(search).value();

    if (foundRow && !resend) {
      // console.log('found Row: ', foundRow);
      continue;
    }

    const measurement = config.influxdb.measurement || 'indicators';
    const fields = config.influxdb.fields || { value: 'int' };
    // const tags = config.influxdb.tags || ['indicator'];
    const schema = { measurement, fields/* , tags */ };

    const point = await getPoint(m, schema);
    if (!foundRow) {
      db.get('metrics').push(m).write();
    } else {
      db.get('metrics')
        .find(search)
        .assign(m)
        .write();
    }

    points.push(point);
    console.log('point: ', JSON.stringify(point));
    // console.log('m: ', m);

    if (points.length >= pointsLimit) {
      console.log('point limit!');
      break;
    }
  }

  await influx.writePoints(points, {
    precision: 'ms',
    retentionPolicy: 'autogen'
  });
  console.log(`sent ${points.length} points`);
}

function getCalendars( { metrics }) {
  const calendars = {};

  // const metricsFiltered = metrics.filter(m => m.indicator === indicator);
  for (let m of metrics) {
    if (!calendars[m.indicator])
    calendars[m.indicator] = ical({
      name: m.indicator,
      timezone: 'GMT+05:00',
    });
    
    createEvent(calendars[m.indicator], m);
  }

  return calendars;
}

function createEvent(calendar, m) {
  const nameMap = {
    'Делал задачи из домашнего списка': 'Домашние дела',
    'Лёг спать до полуночи': 'Лёг спать рано',
    'Встал с первым будильником': 'Встал сразу',
  };
  const summary = nameMap[m.indicator] || m.indicator;

  if (!m.value) return; // не создавать нулевые события

  try {
    calendar.createEvent({
      start: new Date(`${m.date}T05:00:00`),
      allDay: true, //new Date(new Date(`${m.date}T00:00:00 GMT+5`).getTime() + 86400000),
      summary: summary + (!m.value ? ': нет' : ''),
      status: m.value ? 'CONFIRMED' : 'CANCELLED',
      description: `${m.date}: ${m.indicator}: ${m.value}`
    });
    return true;
  }
  catch(e) {
    console.log(e);
    return false;
  }
}

async function getCellByMetric(sheet, m) {
  // перебираем колонки дат
  for (let colNum = indicatorColNum + 1; colNum < maxColNum; colNum++) {

    // date from column
    const dateCell = sheet.getCell(dateRowNum, colNum);
    if (!dateCell.value) continue;
    // console.log('dateCell.value: ', dateCell.value);
    const fromDate = new Date('1899-12-30T00:00:00');
    const delta = parseInt(dateCell.value) * 1000 * 86400;
    const d = new Date(fromDate.getTime() + delta);

    let colDate = format(d, 'yyyy-MM-dd');
    if (colDate != m.date) continue;

    // get indicators for day
    for (let rowNum = dateRowNum + 1; rowNum < maxRowNum; rowNum++) {
      const indicatorCell = sheet.getCell(rowNum, indicatorColNum);
      const indicator = indicatorCell.value;
      if (indicator == m.indicator) {
        const cell = sheet.getCell(rowNum, colNum);
        return cell;
      }
    }
  }

  return false;
}

// write metric to table
async function setMetric(m, opts) {
  const sheetName = getSheetNameByDate(new Date(`${m.date}T00:00:00`));
  const sheet = await loadSheet(sheetName);
  const cell = await getCellByMetric(sheet, m);
  console.log('sheet loaded');
  console.log('m: ', m);
  if (!cell) {
    console.log('cell for metric not found!');
    process.exit(1);
  }

  const value = parseInt(m.value);

  const isAdd = m.value.match(/^\+/);

  if (cell.value === value && !isAdd) {
    console.log(`already recorded: ${value}`);
    return false;
  }

  if (!opts.overwrite && !isAdd && cell.value !== '' && cell.value !== null) {
    console.log(`already recorded: ${cell.value}, do not overwrite:`);
    return false;
  }

  // write
  const cellValue = parseInt(cell.value) || 0;
  cell.value = isAdd ? cellValue + value : value;
  // console.log(isAdd ? parseInt(cell.value) + value : value);
  await sheet.saveUpdatedCells();
}

module.exports = {
  getCalendars,
  processMonthSheet,
  sendToInflux,
  setMetric,
  sheetsToData,
  itemsToDataGpt,
};

// const axios = require('axios');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { format } = require('date-fns');
const fs = require('fs');
const Influx = require('influx');
const ical = require('ical-generator');

const config = require('../config');
// const packageJson = require('../package.json');
const { getSheetNameByDate } = require('./utils');

const low = require('lowdb');

const excludedIndicators = [];

const dateRowNum = 0;
const indicatorColNum = 1;
const maxRowNum = 30;
const maxColNum = 35;

const pointsLimit = 10000;



async function loadSheet(sheetName) {
  // load doc, sheet, rows
  const doc = new GoogleSpreadsheet(config.sheetId);
  await doc.useServiceAccountAuth(config);
  await doc.loadInfo();

  const sheet = doc.sheetsByTitle[sheetName]; // or use doc.sheetsById[id] or doc.sheetsByTitle[title]
  // const rows = await sheet.getRows();
  await sheet.loadCells({
    startRowIndex: 0,
    startColumnIndex: 0,
    endRowIndex: maxRowNum + 10,
    endColumnIndex: maxRowNum + 10,
  });

  return sheet;
}

async function processMonthSheet({ sheetName }) {
  // console.log('sheetName: ' + sheetName);

  const sheet = await loadSheet(sheetName);

  const metrics = [];

  // перебираем колонки дат
  for (let colNum = indicatorColNum + 1; colNum < sheet.columnCount; colNum++) {
    // console.log(`${dateRowNum}, ${colNum}`);
    const dateCell = sheet.getCell(dateRowNum, colNum);
    if (!dateCell.value) continue;
    // console.log('dateCell.value: ', dateCell.value);
    const fromDate = new Date('1899-12-30T00:00:00');
    const delta = parseInt(dateCell.value) * 1000 * 86400;
    const d = new Date(fromDate.getTime() + delta);

    let currentDate = format(d, 'yyyy-MM-dd');
    if (!currentDate) continue;

    // get indicators for day
    for (let rowNum = dateRowNum + 1; rowNum < sheet.rowCount; rowNum++) {
      const m = { date: currentDate };
      const indicatorCell = sheet.getCell(rowNum, indicatorColNum);
      m.indicator = indicatorCell.value;
      
      const cell = sheet.getCell(rowNum, colNum);
      m.value = cell.value;

      if (m.value === null) continue;

      if (!m.indicator) continue;

      if (excludedIndicators.includes(m.indicator)) continue;

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

// sheets to data.txt
// not used
async function sheetsToData(sheetNames) {
  const items = [];
  for (let sheetName of sheetNames) {
    const data = await processMonthSheet({ sheetName });
    items.push(...data);
    // console.log('data: ', data);

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

  const point = {
    measurement: schema.measurement,
    tags: {
      indicator: item.indicator,
    },
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

async function sendToInflux(metrics) {
  const influx = initInflux(config);
  const db = await initDb();

  const points = [];

  for (let m of metrics) {
    const search = { date: m.date, indicator: m.indicator };
    const foundRow = db.get('metrics').find(search).value();

    if (foundRow) {
      // console.log('found Row: ', foundRow);
      continue;
    }

    const measurement = config.influxdb.measurement || 'indicators';
    const fields = config.influxdb.fields || { value: 'int' };
    const tags = config.influxdb.tags || ['indicator'];
    const schema = { measurement, fields, tags };

    const point = await getPoint(m, schema);
    db.get('metrics').push(m).write();

    points.push(point);
    // console.log('m: ', m);

    if (points.length >= pointsLimit) {
      console.log('point limit!');
      break;
    }
  }

  await influx.writePoints(points);
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
  if (!cell) {
    console.log('cell for metric not found!');
    process.exit(1);
  }

  const value = parseInt(m.value);

  if (cell.value === value) {
    console.log(`already recorded: ${value}`);
    return false;
  }

  if (!opts.overwrite && cell.value !== '' && cell.value !== null) {
    console.log(`already recorded: ${cell.value}, do not overwrite:`);
    return false;
  }

  // write
  cell.value = value;
  await sheet.saveUpdatedCells();
}

module.exports = {
  getCalendars,
  processMonthSheet,
  sendToInflux,
  setMetric,
  sheetsToData,
};

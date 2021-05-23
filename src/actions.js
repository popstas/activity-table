// const axios = require('axios');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { format } = require('date-fns');
const fs = require('fs');
const Influx = require('influx');

const config = require('../config');
const { getSheetNameByDate } = require('./utils');

const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const adapter = new FileSync('data/db.json');
const db = low(adapter);
db.defaults({ metrics: [] }).write();

const sheetNames = [
  // 'Июнь 2020',
  // 'Июль 2020',
  // 'Август 2020',
  // 'Сентябрь 2020',
  // 'Октябрь 2020',
  // 'Ноябрь 2020',
  // 'Декабрь 2020',
  // 'Январь 2021',
  // 'Февраль 2021',
  // 'Март 2021',
  // 'Апрель 2021',
  // 'Май 2021',
];

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
  console.log('sheetName:' + sheetName);

  const sheet = await loadSheet(sheetName);

  const metrics = [];

  // перебираем колонки дат
  for (let colNum = indicatorColNum + 1; colNum < maxColNum; colNum++) {
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
    for (let rowNum = dateRowNum + 1; rowNum < maxRowNum; rowNum++) {
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
  for (let sheetName of sheetNames) {
    const data = await processMonthSheet({ sheetName });
    // console.log('data: ', data);

    // writeToTxt(data, `data/${sheetName}.txt`);
    writeToTxt(data, `data/data.txt`);
  }
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

async function sendToInflux(metrics) {
  const influx = initInflux(config);

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

  if (!opts.overwrite && cell.value !== '') {
    console.log(`do not overwrite: ${cell.value}`);
    return false;
  }

  cell.value = parseInt(m.value);
  await sheet.saveUpdatedCells();
}

module.exports = {
  processMonthSheet,
  sendToInflux,
  setMetric,
};

const fs = require('fs');
const sqlite = require('./sqlite');

const {processMonthSheet} = require('./actions');
const {currentMonthSheetName, getSheetNameByDate} = require('./utils');


async function start() {
  const metrics = await processMonthSheet({ sheetName: currentMonthSheetName() });
  // const metrics = await processMonthSheet({ sheetName: 'Январь 2024' });

  // Данные за последнее число месяца не доходят, если я их заполнил после 23
  // Поэтому 1-го числа подгружаем ещё и прошлый месяц
  if (new Date().getDate() == 1) {
    const prevMonthSheetName = getSheetNameByDate(Date.now() - (86400000 * 1));
    metrics.push(...await processMonthSheet({ sheetName: prevMonthSheetName }));
  }

  let items = [];
  try {
    items = JSON.parse(fs.readFileSync('data/items.json', 'utf-8'));
  }
  catch(e){
    console.log('error while append data: ', e);
  }

  for (let m of metrics) {
    const found = items.find(item => {
      return item.date == m.date &&
        item.indicator == m.indicator
    });
    if (found) {
      Object.assign(found, m);
    } else {
      items.push(m);
    }
  }

  console.log('total items: ', items.length);
  fs.writeFileSync('data/items.json', JSON.stringify(items));
  try {
    sqlite.upsertItems(items);
    console.log('items mirrored to SQLite');
  } catch (e) {
    console.log('SQLite mirror error: ', e?.message || e);
  }
}

start();

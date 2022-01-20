const fs = require('fs');

const {processMonthSheet} = require('./actions');
const {currentMonthSheetName, getSheetNameByDate} = require('./utils');


async function start() {
  const metrics = await processMonthSheet({ sheetName: currentMonthSheetName() });

  // Данные за последнее число месяца не доходят, если я их заполнил после 23
  // Поэтому 1-го числа подгружаем ещё и прошлый месяц
  if (new Date().getDate() == 1) {
    const prevMonthSheetName = getSheetNameByDate(Date.now() - (86400000 * 1));
    metrics.push(...await processMonthSheet({ sheetName: prevMonthSheetName }));
  }

  try {
    const items = JSON.parse(fs.readFileSync('data/items.json', 'utf-8'));
    for (let m of metrics) {
      const found = items.find(item => {
        return item.date == m.date &&
          item.indicator == m.indicator
      });
      if (!found) items.push(m);
    }

    console.log('total items: ', items.length);
    fs.writeFileSync('data/items.json', JSON.stringify(items));
  }
  catch(e){
    console.log('error while append data: ', e);
  }
}

start();

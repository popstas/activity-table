const {processMonthSheet, sendToInflux} = require('./actions');
const {getSheetNameByDate} = require('./utils');

const startMonth = '2024-01';
const endMonth = '2024-04';

// ['Январь 2024', 'Февраль 2024', 'Март 2024', 'Апрель 2024']
function getMonthsArray(startMonth, endMonth) {
  const months = [];
  let currentMonth = new Date(startMonth);
  const end = new Date(endMonth);

  while (currentMonth <= end) {
    let month = currentMonth.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
    month = month.replace(' г.', '');
    month = month.charAt(0).toUpperCase() + month.slice(1); // Capitalize first letter
    months.push(month);
    currentMonth.setMonth(currentMonth.getMonth() + 1);
  }

  return months;
}

async function start() {
  const months = getMonthsArray(startMonth, endMonth);

  for (const sheetName of months) {
    // const sheetName = getSheetNameByDate(new Date(month));
    console.log(`Processing sheet: ${sheetName}`);
    const metrics = await processMonthSheet({ sheetName });
    // console.log(metrics);
    // досылает в influx индикаторы, которых там ещё нет
    await sendToInflux(metrics.slice(0, 10), true);
  }
}

start();

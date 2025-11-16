const {processMonthSheet, sendToInflux} = require('./actions');
const {currentMonthSheetName} = require('./utils');

async function start() {
  // достаёт данные текущего месяца
  const metrics = await processMonthSheet({ sheetName: currentMonthSheetName() });

  // досылает в influx индикаторы, которых там ещё нет
  sendToInflux(metrics, true);
}

start();

const {processMonthSheet, sendToInflux} = require('./actions');
const {currentMonthSheetName} = require('./utils');

async function start() {
  // достаёт данные текущего месяца
  const prevMonthSheetName = getSheetNameByDate(Date.now() - (86400000 * 1));
  const metrics = await processMonthSheet({ sheetName: prevMonthSheetName });

  // досылает в influx индикаторы, которых там ещё нет
  sendToInflux(metrics);
}

start();

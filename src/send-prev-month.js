const {processMonthSheet, sendToInflux} = require('./actions');
const {getSheetNameByDate} = require('./utils');

async function start() {
  // достаёт данные текущего месяца
  const prevMonthSheetName = getSheetNameByDate(Date.now() - (86400000 * 28));
  const metrics = await processMonthSheet({ sheetName: prevMonthSheetName });

  // console.log(metrics);
  // return;
  // досылает в influx индикаторы, которых там ещё нет
  sendToInflux(metrics, true);
}

start();

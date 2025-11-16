// сохраняет каждый день и каждую метрику в лист Вся активность
const {itemsToDataGpt} = require('./actions');
const fs = require('fs');

async function start() {
  const data = await itemsToDataGpt();
  const saveTo = 'data/items-gpt.json';
  fs.writeFileSync(saveTo, JSON.stringify(data));
}

start();

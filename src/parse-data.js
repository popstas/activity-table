const {sheetsToData} = require('./actions');
const fs = require('fs');

async function start() {
  const sheetNames = [
    'Июнь 2020',
    'Июль 2020',
    'Август 2020',
    'Сентябрь 2020',
    'Октябрь 2020',
    'Ноябрь 2020',
    'Декабрь 2020',
    'Январь 2021',
    'Февраль 2021',
    'Март 2021',
    'Апрель 2021',
    'Май 2021',
  ];

  const items = await sheetsToData(sheetNames);
  fs.writeFileSync('data/items.json', JSON.stringify(items));
}

start();

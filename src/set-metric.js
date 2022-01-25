const { program } = require('commander');
const pjson = require('../package.json');
const { format } = require('date-fns');
const { setMetric } = require('./actions');

const hoursOffset = 6;

program.name(pjson.name);
program.version(pjson.verion);

program
  .option('-i, --indicator <indicator>', 'indicator')
  .option('-v, --value <value>', 'value')
  .option('-d, --date <date>', 'date')
  .option('-f, --force', 'overwrite non empty cell')


async function start() {
   program.parse(process.argv);

  const options = program.opts();

  if (!options.date) options.date = format(Date.now() - hoursOffset * 3600000, 'yyyy-MM-dd');

  const m = {
    indicator: options.indicator,
    value: options.value,
    date: options.date,
  }

  await setMetric(m, { overwrite: options.force });
}

start();

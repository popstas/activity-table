const {getCalendars} = require('./actions');
const sanitize = require("sanitize-filename");
const fs = require('fs');

async function start() {
  try {
    const data = JSON.parse(fs.readFileSync('data/db.json', 'utf-8'));
    const metrics = data.metrics;
    // exit if no data
    if (!metrics || metrics.length === 0) {
      console.log('no data');
      return;
    }

    const calendars = getCalendars( { metrics });

    const htmlItems = [];

    for (let indicator in calendars) {
      calendar = calendars[indicator];
      const filename = sanitize(indicator.replace(/[\s+\\\/\+]+/g, '-'));
      calendar.saveSync(`data/cal/${filename}.ics`);

      htmlItems.push(`<li><a href="/cal/${filename}.ics">${indicator}</a></li>`);
    }

    let html = `<html><head><meta charset="utf-8"><title>Календари</title></head><body>` +
    `<ul>${htmlItems.join('\n')}</ul>` +
    '</body></html>';

    fs.writeFileSync(`data/cal/index.html`, html);
  }
  catch(e){
    console.log('error while append data: ', e);
  }
}

start();

const { ru } = require('date-fns/locale');
const { format } = require('date-fns');

function currentMonthSheetName() {
  return getSheetNameByDate(new Date());
}

function getSheetNameByDate(d) {
  let name = format(d, 'LLLL yyyy', {locale: ru});
  name = name[0].toUpperCase() + name.substring(1);
  return name;
}

module.exports = {
  currentMonthSheetName,
  getSheetNameByDate,
}
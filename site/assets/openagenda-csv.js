import { dateValue } from './sources.js';

// The publisher's CSV contains quoted cells, embedded line breaks and escaped quotes.
// Keep a strict small envelope and never interpret editorial cells as markup.
function csvRows(input,maxRows) {
  // Anchored tokenizer: delimiters inside quoted values belong to that field.
  // The regex runs in the native engine, avoiding a per-byte JS loop on export text.
  const tokens = /(?:"((?:[^"]|"")*)"|([^",\r\n]*))(,|\r\n|[\r\n]|$)/gy;
  const rows=[];
  let row=[], cursor=Number(input.charCodeAt(0)===0xFEFF);
  while (cursor<input.length) {
    tokens.lastIndex=cursor;
    const match=tokens.exec(input);
    if (!match || tokens.lastIndex<=cursor || row.length>150) throw new Error('Ongeldige agendacel');
    row.push(match[1]===undefined?match[2]:match[1].replace(/""/g,'"'));
    cursor=tokens.lastIndex;
    if (match[3]!==',') {
      if (row.length>1 || row[0]) rows.push(row);
      if (rows.length>maxRows+1) throw new Error('Te veel agendaregels');
      row=[];
    }
  }
  if(row.length)throw new Error('Agenda niet compleet');
  return rows;
}

export function csvRecords(input, fields, maxBytes, maxRows = 200) {
  if (typeof input !== 'string' || input.length > maxBytes) throw new Error('Ongeldige agenda');
  const [head,...rows] = csvRows(input,maxRows);
  if (!head || fields.some(key => !head.includes(key)) || new Set(head).size !== head.length ||
      rows.some(row=>row.length !== head.length)) throw new Error('Ongeldig agendaformaat');
  const indexes = Object.fromEntries(fields.map(key=>[key,head.indexOf(key)]));
  return rows.map(row=>key=>row[indexes[key]]);
}

export function publishedDay(label, today) {
  const parsed = label.match(/^[A-Za-z]+ (\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (20\d{2})$/);
  if (!parsed) return;
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const date = parsed[3] + '-' + String(months.indexOf(parsed[2])+1).padStart(2,'0') + '-' + parsed[1].padStart(2,'0');
  return dateValue(date) && date <= today ? date : undefined;
}
const wallClock = new Intl.DateTimeFormat('sv-SE', {
  timeZone:'Europe/Brussels', year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
});
export function exactLocalTime(value) {
  return /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/.test(value ?? '') &&
    dateValue(value) && wallClock.format(new Date(value)).replace(' ','T') === value.slice(0,19);
}

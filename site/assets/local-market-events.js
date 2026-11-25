import { addCalendarDays } from './sources.js';
import { localMarketTime, marketEasterSunday, normalMarketSpan, uncertainMarketDay } from './market-events.js';

// Facts reviewed against official municipal announcements, not scraped copies.
const ninove = 'https://www.ninove.be/dinsdagmarkt';
const aalst = 'https://aalst.be/cultuur-sport-en-vrije-tijd/winkelen-en-horeca/wekelijkse-markten';
const aalstMove = 'https://aalst.be/nieuws/marktkramers-grote-markt-verhuizen-tijdelijk-naar-parking-keizershallen';
const dendermonde = 'https://www.dendermonde.be/markten';
const dendermondeWinter = 'https://www.dendermonde.be/nieuws/opgelet-marktbezoekers';
const nieuwpoort = 'https://www.nieuwpoort.be/markten';
const nieuwpoortWinter = 'https://www.nieuwpoort.be/nieuws/verplaatste-markten-tijdens-winters-nieuwpoort';

const ronse = 'https://www.ronse.be/nl/wekelijkse-markten';
const lokeren = 'https://lokeren.be/producten-en-diensten/woensdagmarkt';
const lokerenDecember = 'https://visit.lokeren.be/activiteiten/detail/2255/eindejaarsactie-woensdagmarkt-lokeren';
const mechelen = 'https://www.mechelen.be/vrije-tijd-sport-en-cultuur/markt-en-kermis/mechelse-markten?type=event';

export const localMarketSources = {
  ninoveMarkets: { label: 'Stad Ninove · Dinsdagmarkt', href: ninove, attribution: 'Stad Ninove' },
  aalstMarkets: { label: 'Stad Aalst · Wekelijkse markten', href: aalst, attribution: 'Stad Aalst' },
  dendermondeMarkets: { label: 'Stad Dendermonde · Wekelijkse markten', href: dendermonde, attribution: 'Stad Dendermonde' },
  nieuwpoortMarkets: { label: 'Stad Nieuwpoort · Markten', href: nieuwpoort, attribution: 'Stad Nieuwpoort' },
  ronseMarkets: { label: 'Stad Ronse · Markten', href: ronse, attribution: 'Stad Ronse' },
  lokerenMarkets: { label: 'Stad Lokeren · Woensdagmarkt', href: lokeren, attribution: 'Stad Lokeren' },
  mechelenMarkets: { label: 'Stad Mechelen · Markten', href: mechelen, attribution: 'Stad Mechelen' },
};

const aware = 'Volgens het gewone marktrooster. Controleer wijzigingen bij de stad.';
const moved = 'Tijdelijke locatie volgens de stad; de uren volgen het gewone marktrooster.';
const dendermondeBikes = 'Op het maandagmarktparcours zijn fietsen niet toegelaten vanaf 07.30 uur tot de politie het opnieuw opent.';
const aalstBikes = 'Op de markt mag je niet fietsen. Een fiets aan de hand meenemen mag.';
const nieuwpoortFridays = new Set(['2026-11-27', '2026-12-04', '2026-12-11', '2026-12-18']);
const nieuwpoortSaturdays = new Set(['2026-11-28', '2026-12-05', '2026-12-12', '2026-12-19', '2026-12-26', '2027-01-02']);
const nieuwpoortCancelled = new Set(['2026-12-25', '2027-01-01']);
const cautiousDates = new Set(['07-11', '12-26']);
const inRange = (day, first, last) => day >= first && day <= last;

const catalogs = {
  ninove: {
    key: 'ninoveMarkets',
    markets: [{
      code: 'dinsdagmarkt', name: 'Dinsdagmarkt Ninove', weekday: 2, from: '08:00', through: '12:00', href: ninove,
      venue: 'Centrumlaan, Kaardeloodstraat, Marktstraat en Graanmarkt',
      date(day) {
        // Ninove expressly continues on public holidays, apart from its own
        // carnival Tuesday. The city dates that kermis on the Sunday after
        // Ash Wednesday, not the week of Aalst Carnaval (see source notes).
        if (day === addCalendarDays(marketEasterSunday(Number(day.slice(0, 4))), -40)) return null;
        return {};
      },
    }],
  },
  aalst: {
    key: 'aalstMarkets',
    markets: [{
      code: 'zaterdagmarkt', name: 'Zaterdagmarkt Aalst', weekday: 6, from: '08:00', through: '12:30', href: aalst,
      venue: 'Centrum Aalst: Grote Markt en omliggende straten',
      accessNotice: aalstBikes,
      date(day) {
        if (inRange(day, '2026-10-03', '2028-12-31')) return {
          venue: 'Aalst-centrum: Keizershallen en andere marktstraten',
          href: aalstMove, locationChanged: true,
          note: 'De kramen van de Grote Markt staan tijdelijk op Parking Keizershallen. De overige markt loopt door in het centrum. Controleer de precieze opstelling bij de stad.',
        };
        if (day > '2028-12-31') return {
          venue: 'Aalst-centrum, precieze opstelling te controleren', href: aalst,
          note: 'De stad voorzag een terugkeer naar de Grote Markt tegen eind 2028. De exacte terugkeerdatum is niet bevestigd in de bron.',
        };
        return {};
      },
    }, {
      code: 'markt-nieuwerkerken', name: 'Woensdagmarkt Nieuwerkerken', weekday: 3, from: '08:00', through: '12:30',
      href: aalst, venue: 'Dorpsplein, Nieuwerkerken', accessNotice: aalstBikes,
    }],
  },
  dendermonde: {
    key: 'dendermondeMarkets',
    markets: [
      {
        code: 'maandagmarkt', name: 'Maandagmarkt Dendermonde', weekday: 1, from: '08:00', through: '13:00', href: dendermonde,
        venue: 'Dendermonde-centrum, verschillende straten', accessNotice: dendermondeBikes,
        date(day) {
          if (inRange(day, '2026-11-23', '2027-01-15')) return {
            venue: 'Dendermonde-centrum: Ridderstraat, Vlasmarkt en Oude Vest', href: dendermondeWinter, locationChanged: true,
            note: 'De kramen van de Grote Markt staan tijdens de winterwerken in de Ridderstraat, op de Vlasmarkt en op de Oude Vest.',
          };
          return {};
        },
      },
      { code: 'markt-baasrode', name: 'Woensdagmarkt Baasrode', weekday: 3, from: '13:00', through: '17:00',
        venue: 'Dorpsplein, Baasrode', href: dendermonde },
      { code: 'bloemenmarkt-centrum', name: 'Bloemenmarkt Dendermonde', weekday: 0, from: '08:00', through: '14:00',
        venue: 'Heldenplein, Dendermonde', href: dendermonde },
      { code: 'bloemenmarkt-oudegem', name: 'Bloemenmarkt Oudegem', weekday: 0, from: '08:00', through: '14:00',
        venue: 'Kerkplein, Oudegem', href: dendermonde },
    ],
  },
  ronse: {
    key: 'ronseMarkets',
    markets: [{
      code: 'wekelijkse-markt', name: 'Wekelijkse markt Ronse', weekday: [3, 6],
      from: '08:00', through: '12:30', venue: 'Grote Markt', href: ronse,
      date(day) {
        if (inRange(day, '2027-05-22', '2027-05-31')) return {
          venue: 'Parking Portois', locationChanged: true,
          note: 'Tijdens de zomerkermis op Parking Portois. Controleer de markturen bij Stad Ronse.',
        };
        if (day === '2026-12-12' || day === '2027-01-09') return {
          note: 'Gewone markturen; de marktopstelling op de Grote Markt is aangepast.',
        };
        return {};
      },
    }],
  },
  lokeren: {
    key: 'lokerenMarkets',
    markets: [{
      code: 'woensdagmarkt', name: 'Woensdagmarkt Lokeren', weekday: 3,
      from: '07:30', through: '12:30', venue: 'Markt', href: lokeren,
      accessNotice: 'Fietsers moeten in de marktzone afstappen.',
      date(day) {
        if (['2026-12-16','2026-12-23','2026-12-30'].includes(day)) return {
          href: lokerenDecember,
          note: 'Gewone markturen. Visit Lokeren vermeldt een eindejaarsactie tot 13:00.',
        };
        return {};
      },
    }],
  },
  mechelen: {
    key: 'mechelenMarkets',
    markets: [{
      code: 'zaterdagmarkt', name: 'Zaterdagmarkt Mechelen', weekday: 6,
      from: '07:00', through: '13:00', venue: 'Grote Markt en omliggende straten', href: mechelen,
      date(day) {
        // Only the 2026 exception calendar was published in this source. The
        // regular Saturday schedule is not a promise for 2027 festival days.
        if (['2026-05-16','2026-06-27','2026-07-04','2026-08-29'].includes(day)) return null;
        return {};
      },
    }, {
      code: 'kleinhandelsmarkt', name: 'Kleinhandelsmarkt Mechelen', weekday: [1, 3, 5],
      from: '07:00', through: '12:00', venue: 'Koningin Astridlaan, bij de Korte Pennincstraat', href: mechelen,
    }],
  },
  nieuwpoort: {
    key: 'nieuwpoortMarkets',
    markets: [
      {
        code: 'vrijdagmarkt', name: 'Vrijdagmarkt Nieuwpoort', weekday: 5, from: '07:00', through: '12:30', href: nieuwpoort,
        venue: 'Marktplein en omliggende straten',
        date(day) {
          if (nieuwpoortCancelled.has(day)) return null;
          if (nieuwpoortFridays.has(day)) return {
            venue: 'Fonteinenplein en aanpalende parking', href: nieuwpoortWinter, locationChanged: true, dated: true,
          };
          return {};
        },
      },
      {
        code: 'boerenmarkt', name: 'Boerenmarkt Nieuwpoort', weekday: 6, from: '09:00', through: '12:00', href: nieuwpoort,
        venue: 'Marktplein',
        date(day) {
          if (nieuwpoortSaturdays.has(day)) return {
            venue: 'Hendrik Geeraertplein', href: nieuwpoortWinter, locationChanged: true, dated: true,
          };
          return {};
        },
      },
    ],
  },
};

export function getLocalMarketEvents(city, options = {}) {
  const slug = city?.slug;
  if (!Object.hasOwn(catalogs, slug)) return { items: [], limited: false };
  const period = normalMarketSpan(options);
  if (options.planner) return { items: [], limited: period.limited };
  const { key, markets } = catalogs[slug];
  const items = [];
  for (let day = period.from; day <= period.through; day = addCalendarDays(day, 1)) {
    const weekday = new Date(day + 'T12:00:00Z').getUTCDay();
    const uncertain = slug !== 'ninove' && (cautiousDates.has(day.slice(5)) || uncertainMarketDay(day));
    for (const market of markets) {
      const weekdays = Array.isArray(market.weekday) ? market.weekday : [market.weekday];
      if (!weekdays.includes(weekday)) continue;
      const date = market.date ? market.date(day) : {};
      if (!date || (uncertain && !date.dated)) continue;
      const start = localMarketTime(day, market.from), end = localMarketTime(day, market.through);
      if (!start || !end) continue;
      const website = date.href ?? market.href;
      const description = [date.note ?? (date.locationChanged ? moved : aware), market.accessNotice].filter(Boolean).join(' ');
      items.push({
        id: key + ':' + market.code + ':' + day, source: key, sourceId: market.code,
        sourceRecord: website, website, city: slug, name: market.name, category: 'Markt', start, end,
        venue: date.venue ?? market.venue, scheduleBased: true, plannerEligible: false, description,
        ...(date.locationChanged && { locationChanged: true }),
        ...(market.accessNotice && { accessNotice: market.accessNotice }),
      });
    }
  }
  return { items, limited: period.limited };
}

export function localMarketEventSource(city, options = {}) {
  const slug = city?.slug;
  return Object.hasOwn(catalogs, slug) ? {
    key: catalogs[slug].key, run: async () => getLocalMarketEvents(city, options),
  } : undefined;
}

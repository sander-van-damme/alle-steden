import { itineraryDistanceSteps, sliderIndexForKm } from './planner-distance-scale.js';
import { parseDepartureAddress, validOriginPoint } from './departure-origin.js';
import { plannerActivityIds } from './planner-activities.js';

export function bindItineraryEditor(form, {
  cities, startSlug, today, initialDate = '', onBuild, onEdit,
}) {
  const find = (id) => form.querySelector('#' + id);
  const start = find('itinerary-start');
  const origin = find('itinerary-origin');
  const departure = find('itinerary-departure');
  const departureField = find('itinerary-departure-field');
  const locationButton = find('itinerary-use-location');
  const locationStatus = find('itinerary-location-status');
  const originNote = find('itinerary-location-note');
  let deviceOrigin = null, locationAttempt = 0;
  const end = find('itinerary-end');
  const endField = find('itinerary-end-field');
  const finishes = [...form.querySelectorAll('[name=itineraryFinish]')];
  const finish = () => finishes.find(input=>input.checked)?.value ?? 'any';
  const date = find('itinerary-date');
  const min = find('itinerary-min-km'), max = find('itinerary-max-km');
  const minSlider = find('itinerary-min-slider'), maxSlider = find('itinerary-max-slider');
  const budget = find('itinerary-stop-budget');
  const submit = find('itinerary-build');
  const error = find('itinerary-form-error');
  const catalog = new Map(cities.map((city) => [city.slug, city]));

  const normalize = value => value.trim().normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('nl-BE');
  const names = new Map();
  for (const city of cities) {
    for (const name of new Set([city.slug,city.name,...(city.names ?? [])].map(normalize))) {
      names.set(name, names.has(name)&&names.get(name)!==city.slug ? null : city.slug);
    }
  }
  const citySlug = input => names.get(normalize(input.value)) ?? '';
  if (catalog.has(startSlug)) start.value = catalog.get(startSlug).name;
  date.value = initialDate || today;

  function filters() {
    const checked = new Set([...form.querySelectorAll('[name="itineraryActivity"]:checked')].map(({ value }) => value));
    return {
      include: plannerActivityIds.filter((id) => checked.has(id)),
      exclude: plannerActivityIds.filter((id) => !checked.has(id)),
      scheduledOnly: find('itinerary-scheduled-only').checked,
    };
  }

  function reflectDistance(input, slider) {
    if (!input.validity.valid) return;
    slider.value = sliderIndexForKm(input.valueAsNumber);
    slider.setAttribute('aria-valuetext', input.value + ' km');
  }

  function reconcileDistance(edited) {
    if (min.validity.valid && max.validity.valid && min.valueAsNumber > max.valueAsNumber) {
      if (edited === min) max.value = min.value;
      else min.value = max.value;
    }
    reflectDistance(min, minSlider);
    reflectDistance(max, maxSlider);
  }

  function syncCities() {
    const showEnd = finish() === 'specific';
    endField.hidden = !showEnd;
    end.disabled = !showEnd;
    end.required = showEnd;
    departure.disabled = departureField.hidden = !origin.value.trim() && !deviceOrigin;
    originNote.hidden = !deviceOrigin && (!origin.value.trim() || !!citySlug(origin));
    find('itinerary-address-note').hidden = !!deviceOrigin;
    departure.required = !departure.disabled;
  }

  function edited() {
    error.textContent = '';
    onEdit?.();
  }

  function readRequest() {
    const loop = finish() === 'loop';
    const startSlug = citySlug(start);
    const endSlug = finish() === 'specific' ? citySlug(end) : '';
    const waypoints = [startSlug, endSlug].filter(Boolean).map((slug) => ({ slug, kind: 'pass' }));
    return {
      date: date.value || today, loop, minKm: +min.value, maxKm: +max.value,
      startSlug, ...(endSlug && { endSlug }), originCity: deviceOrigin ?? catalog.get(citySlug(origin)), originAddress: !deviceOrigin && !citySlug(origin) && origin.value.trim() || '', departure: departure.value || '09:00', waypoints,
      stopBudget: budget.value ? +budget.value : null, ...filters(),
    };
  }

  for (const input of [start,end]) input.addEventListener('input', edited);
  function clearDevice() {
    locationAttempt++;
    deviceOrigin=null;
    locationButton.textContent='Gebruik mijn locatie';
    locationButton.disabled=false;
    locationStatus.textContent='';
  }
  origin.addEventListener('input', () => { clearDevice(); syncCities(); edited(); });
  locationButton.addEventListener('click', () => {
    if(deviceOrigin){clearDevice();syncCities();edited();return;}
    if(!navigator.geolocation){locationStatus.textContent='Locatie is niet beschikbaar. Typ een stad of adres.';return;}
    const attempt=++locationAttempt;
    locationButton.disabled=true;
    locationStatus.textContent='Locatie bepalen…';
    navigator.geolocation.getCurrentPosition(({coords})=>{
      if(attempt!==locationAttempt)return;
      locationButton.disabled=false;
      if(!validOriginPoint(coords.longitude,coords.latitude)){
        locationStatus.textContent='Kies een vertrekpunt in België.';return;
      }
      deviceOrigin={lon:coords.longitude,lat:coords.latitude,name:'Je locatie',privatePoint:true};
      origin.value='';
      locationButton.textContent='Locatie vergeten';
      locationStatus.textContent='Locatie klaar voor deze rit.';
      syncCities();edited();
    },()=>{
      if(attempt!==locationAttempt)return;
      locationButton.disabled=false;
      locationStatus.textContent='Geen locatie ontvangen. Typ een stad of adres.';
    },{maximumAge:0,timeout:7000,enableHighAccuracy:false});
  });
  departure.addEventListener('change', edited);
  for (const control of finishes) control.addEventListener('change', () => {
    syncCities();
    edited();
  });
  for (const [input,slider] of [[min,minSlider],[max,maxSlider]]) {
    input.addEventListener('input', () => { reflectDistance(input,slider); edited(); });
    input.addEventListener('change', () => reconcileDistance(input));
    slider.addEventListener('input', () => {
      input.value = itineraryDistanceSteps[slider.valueAsNumber];
      reconcileDistance(input);
      edited();
    });
  }
  for (const control of [date, budget, ...form.querySelectorAll('[name="itineraryActivity"], #itinerary-scheduled-only')]) {
    control.addEventListener('change', edited);
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    reconcileDistance(document.activeElement === min ? min : max);
    const request = readRequest();
    if (!catalog.has(request.startSlug) && (start.value.trim() || !request.originCity && !request.originAddress)) {
      error.textContent = 'Kies een stad om te fietsen, of vul in vanwaar je vertrekt.';
      start.focus();
      return;
    }
    if (finish() === 'specific' && (!catalog.has(request.endSlug) || request.endSlug === request.startSlug)) {
      error.textContent = 'Kies een andere eindstad, of kies Terug naar vertrek.';
      end.focus();
      return;
    }
    if (request.originAddress && !parseDepartureAddress(request.originAddress)) {
      error.textContent = 'Typ een stad of gebruik dit adresformaat: Straat 12, 9000.';
      origin.focus();
      return;
    }
    onBuild?.(request);
  });
  syncCities();
  reconcileDistance();
  submit.disabled = false;
  return { readRequest, setBusy: (active) => { submit.disabled = Boolean(active); } };
}

import { itineraryDistanceSteps, sliderIndexForKm } from './planner-distance-scale.js';
import { plannerActivityIds } from './planner-activities.js';

export function bindItineraryEditor(form, {
  cities, startSlug, today, initialDate = '', onBuild, onEdit,
}) {
  const find = (id) => form.querySelector('#' + id);
  const start = find('itinerary-start');
  const end = find('itinerary-end');
  const endField = find('itinerary-end-field');
  const type = find('itinerary-type');
  const date = find('itinerary-date');
  const min = find('itinerary-min-km'), max = find('itinerary-max-km');
  const minSlider = find('itinerary-min-slider'), maxSlider = find('itinerary-max-slider');
  const budget = find('itinerary-stop-budget');
  const submit = find('itinerary-build');
  const error = find('itinerary-form-error');
  const catalog = new Map(cities.map((city) => [city.slug, city]));

  for (const select of [start, end]) {
    for (const node of select.querySelectorAll('option[value]')) {
      if (node.value && !catalog.has(node.value)) node.remove();
    }
  }
  if (catalog.has(startSlug)) start.value = startSlug;
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
    const loop = type.value === 'loop';
    endField.hidden = loop;
    end.disabled = loop;
    for (const opt of start.options) opt.disabled = Boolean(opt.value && !loop && opt.value === end.value);
    for (const opt of end.options) opt.disabled = Boolean(opt.value && opt.value === start.value);
  }

  function edited() {
    error.textContent = '';
    onEdit?.();
  }

  function readRequest() {
    const loop = type.value === 'loop';
    const startSlug = start.value;
    const endSlug = loop ? '' : end.value;
    const waypoints = [startSlug, endSlug].filter(Boolean).map((slug) => ({ slug, kind: 'pass' }));
    return {
      date: date.value || today, loop, minKm: +min.value, maxKm: +max.value,
      startSlug, ...(endSlug && { endSlug }), waypoints,
      stopBudget: budget.value ? +budget.value : null, ...filters(),
    };
  }

  for (const control of [start, end, type]) control.addEventListener('change', () => {
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
    if (!catalog.has(request.startSlug)) {
      error.textContent = 'Kies een vertrekstad.';
      start.focus();
      return;
    }
    if (request.endSlug && (!catalog.has(request.endSlug) || request.endSlug === request.startSlug)) {
      error.textContent = 'Kies een andere eindstad of kies een lusrondrit.';
      find('itinerary-advanced').open = true;
      end.focus();
      return;
    }
    onBuild?.(request);
  });
  syncCities();
  reconcileDistance();
  submit.disabled = false;
  return { readRequest, setBusy: (active) => { submit.disabled = Boolean(active); } };
}

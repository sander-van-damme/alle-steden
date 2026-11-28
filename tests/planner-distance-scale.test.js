import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itineraryDistanceSteps as km, sliderIndexForKm } from '../site/assets/planner-distance-scale.js';

test('native input scale reserves more travel for shorter trips, with legible round values',()=>{
  assert.equal(km[0],0);
  assert.equal(km.at(-1),500);
  assert.equal(km[sliderIndexForKm(29)+1]-29,1);
  assert.equal(km[sliderIndexForKm(45)+1]-45,5);
  assert.equal(km[sliderIndexForKm(120)+1]-120,10);
  assert.equal(km[sliderIndexForKm(200)+1]-200,25);
  assert.ok(km.every((value,i)=>i===0||value>km[i-1]));
  assert.equal(km[sliderIndexForKm(307)],300);
});

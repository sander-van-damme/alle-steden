// A native slider indexes familiar kilometre values. Short trips get most of
// the travel; the companion number input can still enter any whole kilometre.
const steps = (start, end, by) => Array.from({length:(end-start)/by+1},(_,i)=>start+i*by);
export const maximumItineraryKm = 500;
export const coarseItineraryKm = 200;
export const minimumItineraryMaxKm = 2;
export const itineraryDistanceSteps = Object.freeze([
  ...steps(0,30,1), ...steps(35,100,5), ...steps(110,coarseItineraryKm,10),
  ...steps(coarseItineraryKm+25,maximumItineraryKm,25),
]);
export function sliderIndexForKm(km) {
  return itineraryDistanceSteps.reduce((best,value,index)=>
    Math.abs(value-km)<Math.abs(itineraryDistanceSteps[best]-km)?index:best,0);
}

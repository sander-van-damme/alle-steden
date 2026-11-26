import { createWorker } from './router.js';
import { catalogs } from './.generated/catalogs.js';

export default createWorker(catalogs);

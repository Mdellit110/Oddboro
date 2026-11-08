// The floor's code that runs PixiJS, in one module the page loads with
// import() once it mounts. PixiJS is the largest thing the office draws with,
// so it stays out of the code the first page needs (issue #13).
export { addArt } from './art.ts';
export { Floor, sharedAtlas } from './engine.ts';
export { loadLook } from './looks.ts';
export { StaffActor } from './staff.ts';
export { bus, hideBuilding, raise } from './reveal.ts';

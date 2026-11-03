// Every page is a plain file: the whole site prerenders, and each page lands
// at its own folder's index.html so any static host serves it as is.
export const prerender = true;
export const trailingSlash = 'always';

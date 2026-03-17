// Safe fetch shim to prevent polyfills from overwriting window.fetch
export const fetch = window.fetch.bind(window);
export default fetch;

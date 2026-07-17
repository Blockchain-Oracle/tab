export { createLeashFetch } from "./fetch-wrapper.js";
export type CreateLeashFetchOptions = Parameters<
  typeof import("./fetch-wrapper.js").createLeashFetch
>[0];

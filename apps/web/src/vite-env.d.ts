/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the API when it is not served from the same host; empty uses relative URLs. */
  readonly VITE_API_BASE_URL?: string;
}

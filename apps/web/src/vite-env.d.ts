/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the API when it is not served from the same host; empty uses relative URLs. */
  readonly VITE_API_BASE_URL?: string;
  /**
   * Raster tile template for the basemap. Defaults to OpenStreetMap's own
   * service; set this to point at another provider without a code change.
   */
  readonly VITE_MAP_TILE_URL?: string;
}

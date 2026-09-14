import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  type LngLatBoundsLike,
} from 'maplibre-gl';
import { useEffect, useRef, type JSX } from 'react';
import { boundsOf, padBounds, toBboxParam, type BoundingBox } from '../model/bounds.js';
import { basemapStyle, DEFAULT_ZOOM, MAX_ZOOM, YEREVAN_CENTRE } from '../model/map-style.js';

export interface MapMarker {
  id: string;
  lat: number;
  lon: number;
  /** Shown in the pin; short, because the pin is the size of its text. */
  short: string;
  /** Shown in the popup when the pin is opened. */
  title: string;
  subtitle: string;
}

export interface ListingMapProps {
  markers: readonly MapMarker[];
  /**
   * Describes the map to assistive technology. A canvas of pins cannot be read,
   * so the label says what is on it and the same listings are always available
   * as a list beside it.
   */
  label: string;
  /** Highlighted pin, for hovering a card in the list. */
  activeId?: string | undefined;
  /** Fits the view to the markers whenever they change. */
  fit?: boolean;
  /** Called after the reader pans or zooms, with the new visible area. */
  onAreaChange?: ((bbox: string) => void) | undefined;
  onSelect?: ((id: string) => void) | undefined;
  className?: string;
}

/** Keeps a fitted view off the edges, and gives a single marker something to zoom to. */
const FIT_MARGIN_DEGREES = 0.004;

/**
 * The map view.
 *
 * MapLibre owns its own DOM and is imperative, so the whole integration is
 * effects over refs: one effect builds the map, a second keeps the markers in
 * step, a third moves the view. Callbacks are held in refs so that a parent
 * re-render does not tear down and rebuild every pin.
 *
 * The component renders nothing in a test environment — jsdom has no WebGL — so
 * the logic worth testing lives in `../model`, not here.
 */
export function ListingMap({
  markers,
  label,
  activeId,
  fit = true,
  onAreaChange,
  onSelect,
  className,
}: ListingMapProps): JSX.Element {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const pins = useRef(new Map<string, Marker>());
  const onSelectRef = useRef(onSelect);
  const onAreaChangeRef = useRef(onAreaChange);

  useEffect(() => {
    onSelectRef.current = onSelect;
    onAreaChangeRef.current = onAreaChange;
  }, [onSelect, onAreaChange]);

  useEffect(() => {
    const element = container.current;
    // Captured for the cleanup, which must not read the ref after unmount.
    const markerRegistry = pins.current;
    if (element === null) {
      return undefined;
    }
    const instance = new MapLibreMap({
      container: element,
      style: basemapStyle(),
      center: YEREVAN_CENTRE,
      zoom: DEFAULT_ZOOM,
      maxZoom: MAX_ZOOM,
      // The pins carry the information; tilting and rotating only make them harder to read.
      pitchWithRotate: false,
      dragRotate: false,
      attributionControl: { compact: true },
    });
    instance.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    instance.on('moveend', () => {
      const report = onAreaChangeRef.current;
      if (report === undefined) {
        return;
      }
      const bounds = instance.getBounds();
      report(
        toBboxParam([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]),
      );
    });
    map.current = instance;

    return () => {
      instance.remove();
      map.current = null;
      markerRegistry.clear();
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (instance === null) {
      return;
    }
    for (const marker of pins.current.values()) {
      marker.remove();
    }
    pins.current.clear();

    for (const item of markers) {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'se-map-pin';
      // textContent, never innerHTML: these strings come from listing data.
      element.textContent = item.short;
      element.setAttribute('aria-label', `${item.title}, ${item.subtitle}`);
      element.addEventListener('click', () => {
        onSelectRef.current?.(item.id);
      });

      const popup = new Popup({ offset: 16, className: 'se-map-popup' }).setDOMContent(
        popupContent(item),
      );

      pins.current.set(
        item.id,
        new Marker({ element }).setLngLat([item.lon, item.lat]).setPopup(popup).addTo(instance),
      );
    }
  }, [markers]);

  useEffect(() => {
    for (const [id, marker] of pins.current.entries()) {
      marker.getElement().dataset.active = String(id === activeId);
    }
  }, [activeId, markers]);

  useEffect(() => {
    const instance = map.current;
    if (instance === null || !fit) {
      return;
    }
    const bounds = boundsOf(markers);
    if (bounds === undefined) {
      return;
    }
    instance.fitBounds(asLngLatBounds(padBounds(bounds, FIT_MARGIN_DEGREES)), {
      duration: 0,
      maxZoom: 16,
    });
  }, [markers, fit]);

  return (
    <div
      ref={container}
      className={`se-map ${className ?? ''}`}
      role="application"
      aria-label={label}
    />
  );
}

function asLngLatBounds(bounds: BoundingBox): LngLatBoundsLike {
  const [west, south, east, north] = bounds;
  return [
    [west, south],
    [east, north],
  ];
}

function popupContent(item: MapMarker): HTMLElement {
  const wrapper = document.createElement('div');
  const title = document.createElement('p');
  title.textContent = item.title;
  title.style.fontWeight = '600';
  const subtitle = document.createElement('p');
  subtitle.textContent = item.subtitle;
  wrapper.append(title, subtitle);
  return wrapper;
}

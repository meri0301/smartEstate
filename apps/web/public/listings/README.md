# Listing photographs

The imagery the seeded catalogue uses. Served by the web application at
`/listings/<name>`, and written into the `media` table by
`apps/api/prisma/seed/steps/inventory.ts`.

## What goes here

Twelve photographs, named exactly:

```
apartment-01.webp … apartment-12.webp
```

Apartment interiors and building exteriors — living rooms, kitchens, bedrooms,
a few façades. Landscape orientation, about 1200 × 800, WebP, ideally under
300 KB each so a page of twenty-four cards stays light.

The filenames are declared in `apps/api/prisma/seed/data/photos.ts`. That list
is the contract: a file not named there is never used, and a name there with no
file behind it is a broken image on every card that draws it — which
`photos.spec.ts` fails on, so it cannot ship unnoticed.

Adding a thirteenth is two steps: drop the file in, add its name to the list.

## Why they are here rather than fetched

The catalogue used `picsum.photos`, which returns a random photograph of
anything for a given seed. A property site showed frost, industrial silos and
open sea.

There is no version of that idea that works. Picsum's catalogue carries no
keywords, so it cannot be asked for apartments. Tag-based services are worse
than they sound: `apartment,interior` on Flickr returns a door handle, a shop
floor and a sign reading "BICYCLE STORAGE", because the tags are written by
whoever uploaded the picture.

Local imagery also means the catalogue works with no internet, which the rest
of the project already assumes — it runs on `docker compose up` and nothing
else.

## After changing anything here

```bash
pnpm --filter @smartestate/api db:seed
```

The database keeps whatever URLs it was last seeded with, so a change to this
folder or to the list has no effect until the catalogue is seeded again.

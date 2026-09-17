# Landing page artwork

Exports from the SmartEstate Figma file, frame `Landing Page` (node `2-3`,
1440 × 5048). They live under `src/` rather than `public/` so the bundler
fingerprints them for caching and, more usefully, so a rename fails the build
instead of shipping a hole in the page.

They are imported by `src/features/home/assets.ts` and painted as CSS
backgrounds. Every one is decorative — the headline and the step headings carry
the meaning — so none of them needs alternative text.

| File                        | Layer in the frame           | Exported as       |
| --------------------------- | ---------------------------- | ----------------- |
| `hero-house.jpg`            | hero photograph (mask group) | JPEG, 2240 × 1256 |
| `step-property-details.png` | line-drawn house             | PNG, transparent  |
| `step-market-analysis.png`  | line-drawn brain             | PNG, transparent  |
| `step-recommendation.png`   | line-drawn laptop            | PNG, transparent  |

Two things to keep in mind when re-exporting.

The line drawings must come out **on transparency**, not with the card behind
them: export the drawing layer itself, not the frame that holds it. A drawing
exported with its grey panel baked in stays light when the card goes dark.

The photograph is downscaled to twice its 1120px display width. Figma exports it
at 4096px and 7.1 MB, which is a 7 MB first paint for a 1120px slot; 2240px at
quality 82 is 336 KB and indistinguishable on screen.

Re-export at the same names to replace one; nothing else needs to change.

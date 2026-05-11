# Design System — Ankit & Shreeya · Our Life

Scrollable cinematic love-letter. Warm cream base, earthy inks, season-driven scene palettes. Vanilla HTML/CSS/Canvas.

---

## 1. Design Philosophy

- **Mood**: handcrafted, analog, nostalgic. Soft, warm, cream-paper.
- **Motion first**: scroll = time. Day/season/weather/life-events all scroll-driven.
- **No dark mode** — forced `color-scheme: light` (see `index.html:6`, `index.html:18`).
- **No night** — `nightness()` returns `0`; daylight always (`life.js:85`).
- **Hierarchy by italics + softness**, not weight. Serif italics carry emotion; mono carries data.

---

## 2. Typography

Fonts loaded from Google Fonts (`index.html:10`):

| Family | Use | Weights |
|---|---|---|
| `Instrument Serif` | display, italics, emotion (hero, names, memory labels) | 400 (incl. italic) |
| `Geist` | body sans, UI | 300 / 400 / 500 / 600 |
| `Geist Mono` | HUD, labels, metadata, kbd | 400 / 500 |
| `Caveat` | handwritten accent (loaded, reserved) | 400 / 600 |

### Scales

| Token | Size | Where |
|---|---|---|
| Hero H1 | `clamp(48px, 8vw, 110px)` · line-height `.95` · letter-spacing `-.02em` | `.intro h1` |
| Year ghost | `clamp(200px, 26vw, 380px)` · opacity `.12` · italic | `.year-marker` |
| Event flash | `clamp(36px, 5vw, 60px)` · italic | `.event-flash` |
| HUD big date | `26px` italic serif | `.hud .big` |
| Status now | `22px` italic serif | `.status .now` |
| Scene label | `18px` italic serif | `.scene-label` |
| Portrait name | `22px` italic serif | `.portrait .name` |
| Memory label | `14px` italic serif | `.theatre .memory-label` |
| Intro sub | `17px` italic serif | `.intro .sub` |
| HUD row | `11px` mono · letter-spacing `.08em` · uppercase | `.hud .row`, `.status` |
| Role tag | `10px` mono · letter-spacing `.2em` · uppercase | `.portrait .role` |
| Tag line | `11px` mono · letter-spacing `.25em` · uppercase | `.intro .tag` |
| Hint | `10px` mono · letter-spacing `.18em` · uppercase | `.hint` |
| kbd | `9px` mono · 1px border | `.hint kbd` |

Body default: `Geist 300`, antialiased.

---

## 3. Core Color Palette

### CSS custom properties (`index.html:12`)

| Token | Hex | Role |
|---|---|---|
| `--ink` | `#2a1c14` | primary text, darkest warm brown |
| `--ink-soft` | `#5a4838` | secondary text |
| `--muted` | `#a89480` | muted/tertiary |
| `--cream` | `#fff6ec` | page background |
| `--clay` | `#c9a486` | accent, borders, year ghost |

### Extended UI colors (used inline)

| Hex | Role |
|---|---|
| `#fff6ec` | cream page bg |
| `#f2e1c8` | cartoon bg gradient bottom |
| `#fffbf2` → `#faecda` | memory blob gradient (`index.html:215`) |
| `#3a2418` | scene-label text, dark shoe |
| `#3a4a5c` | Ankit pants / deep navy |
| `#c46848` | terracotta accent (hero `em`, intro, scarves, hearts) |
| `#d87888` | rose (tape pulse dot) |
| `rgba(255,246,236, .7–.72)` | HUD glass background |
| `rgba(201,164,134, .35–.55)` | clay borders |
| `rgba(90,60,40, .15–.45)` | warm shadows |

### Surfaces (glass-morphism recipe)

```
background:     rgba(255, 246, 236, 0.72);
backdrop-filter: blur(8px);
border:         1px solid rgba(201, 164, 134, 0.35);
border-radius:  12px;   /* cards: 12; pill: 999; flash: 14 */
box-shadow:     0 4px 20px -8px rgba(90, 60, 40, 0.15);
padding:        14px 18px;
```

Applied to: `.hud`, `.status`, `.hint`, `.event-flash`, `.scene-label`.

---

## 4. Scene Palettes (canvas, `life.js`)

Driven by `mIdx` (month index). All values are `[r,g,b]`.

### Sky — per month, top → mid → bottom (`life.js:143`)

| Month | Top | Mid | Bottom |
|---|---|---|---|
| Jan | `196,214,228` | `224,230,232` | `240,238,232` |
| Feb | `190,198,226` | `220,220,236` | `240,230,232` |
| Mar | `178,214,220` | `224,234,226` | `246,238,224` |
| Apr | `150,198,226` | `210,228,226` | `248,232,216` |
| May | `140,192,228` | `218,230,216` | `248,228,204` |
| Jun | `120,188,232` | `200,224,220` | `250,224,190` |
| Jul | `108,180,236` | `190,218,214` | `252,220,176` |
| Aug | `150,176,224` | `214,210,196` | `250,210,168` |
| Sep | `188,180,214` | `232,210,176` | `252,204,156` |
| Oct | `220,168,180` | `244,200,160` | `250,196,140` |
| Nov | `178,164,180` | `214,188,168` | `232,190,158` |
| Dec | `160,174,198` | `196,198,204` | `224,208,196` |

Warm sunrise/sunset tint overlay: `[245,150,90]` up to 40% at bottom.
Storm darkening: `[40,48,62]` up to 35% top.

### Night sky (seasons 0–3, currently unused — `nightness=0`; `life.js:171`)

| Season | Top | Mid | Horizon |
|---|---|---|---|
| Winter | `8,12,28` | `18,26,48` | `38,46,64` |
| Spring | `10,16,40` | `24,34,60` | `46,56,80` |
| Summer | `12,18,50` | `26,38,72` | `48,60,92` |
| Autumn | `20,14,40` | `36,24,56` | `58,42,72` |

### Sun colors by season (`life.js:267`)

| Season | RGB | Radius |
|---|---|---|
| Winter | `240,234,214` | 44 |
| Spring | `252,230,180` | 44 |
| Summer | `255,218,140` | 52 |
| Autumn | `250,180,120` | 44 |

Moon: core `rgba(250,245,230, .9·a)` → halo `rgba(230,228,210, 0)`. Craters `rgba(200,194,175, .5·a)`.

### Mountain layers — back → front (`life.js:317`)

| Season | Layer 1 | Layer 2 | Layer 3 |
|---|---|---|---|
| Winter | `112,130,148` | `148,162,176` | `188,198,206` |
| Spring | `100,130,110` | `136,162,132` | `180,198,170` |
| Summer | `78,120,84`   | `118,156,114` | `170,196,150` |
| Autumn | `140,102,76` | `172,138,96`  | `206,180,136` |

Winter snow-caps: `rgba(255,255,255, .7)`.

### Ground (`life.js:371`)

| Season | RGB |
|---|---|
| Winter | `238,238,240` (snow) |
| Spring | `158,186,128` |
| Summer | `128,168,96`  |
| Autumn | `190,154,96`  |

Grass texture strokes: `rgba(255,255,255, .08)`.

### Tree foliage (`life.js:418`)

| Season | Palette |
|---|---|
| Winter | bare (none) |
| Spring | `#9cc66e` `#b8d880` `#7eb058` |
| Summer | `#6fa85a` `#8bbf6a` `#558a42` |
| Autumn | `#d87a3a` `#e8a74a` `#c95828` `#f2b860` |

Trunk/branches: `#6b4a32`.

### Flowers (`life.js:463`)

- Spring: `#f2a6c0` `#f6cde0` `#ffe070` `#b8e080` `#dda0dd`
- Summer: `#ff9a6c` `#ffd36e` `#c7e86a` `#f56a8c` `#ffc04a`
- Stem `#6a8a4a`, center `#ffe070`.

### Clouds (`life.js:505`)

- Day `[255,255,255]`, night `[120,128,148]`, storm `[55,62,82]` (mixed 55%).
- Alpha base: winter `.50`, other seasons `.72`, +`cloud·.18`.

### Particles / weather (`life.js:597–656`)

| Kind | Colors |
|---|---|
| snow | `rgba(255,255,255, 0.75–0.9)` |
| petals | `#f2a6c0` `#f6cde0` `#ffd0e3` |
| pollen | `rgba(255,230,150, 0.1–0.7)` |
| leaves (autumn) | `#d87a3a` `#e8a74a` `#c95828` `#f2b860` |
| rain | `rgba(120,140,180, .9)` / `rgba(140,170,210, .9)` |
| mist | `rgba(180,200,220, .35)` |
| fireflies | `rgba(255,238,160, gl)` core, `rgba(255,250,200, gl·.9)` glow |
| haze | `rgba(255,240,220, .05–.07)` |

Lightning flash: sky wash `rgba(240,246,255, ≤.55)`, bolt `rgba(255,255,240, ≤1)`, glow `rgba(200,220,255, .95)`.

---

## 5. Cartoon Theatre Palette (`life.js:900`)

Two recurring characters rendered on a 680×440 canvas inside a morphing SVG blob.

| Token | Hex | Use |
|---|---|---|
| `SKIN_A` | `#e8c39f` | Ankit skin |
| `SKIN_S` | `#f0cfa8` | Shreeya skin |
| `HAIR_A` | `#2a1c14` | Ankit hair |
| `HAIR_S` | `#1f1310` | Shreeya hair |
| `SHIRT_A` | `#5b8bb5` | Ankit shirt (blue) |
| `PANTS_A` | `#3a4a5c` | Ankit pants |
| `DRESS_S` | `#9cae94` | Shreeya dress (sage) |
| `SCARF_S` | `#c46848` | Shreeya scarf (terracotta) |
| `SHOE` | `#3a2418` | shoes |

Theatre backdrop: linear gradient `#fff6ec` → `#f2e1c8`. Ground-line `rgba(90,60,40, .15)`.
Old-age hair: `#d8cfc2`. Wedding whites: `#fffaf0`.

### Landmark / props accent colors (sampled)

`#c9a486` sandstone · `#8aa8c4` pale steel · `#e8c4a8` warm stone · `#b0c0d0` patina · `#d8cfc2` limestone · `#c2b098` sphinx · `#f2a6c0` opera pink · `#e8a74a` gold · `#6a8a4a` leaf · `#2a4a2a` fir · `#8b6a4a` warm wood · `#3a5a7a` deep water · `#6a9ab4` river · `#98a8b8` dove · `#8a9a7a` moss · `#cde4ee` ice · `#1a2040` night interior · `#1a0e08` tuxedo · `#ffd36e` gold-yellow · `#f56a8c` pink-red.

---

## 6. Layout & Layering (z-index)

Fixed canvases + HUD stack; body is `min-height: 4000vh` for long scroll.

| z | Element | Selector |
|---|---|---|
| 0 | Scene canvas (sky/mountains/ground/trees/flowers/clouds) | `#sceneCanvas` |
| 1 | Particles canvas (weather/birds/fireflies) | `#particlesCanvas` |
| 5 | Year ghost + intro | `.year-marker`, `.intro` |
| 10 | Portraits stage | `.stage` |
| 20 | Scene label, event flash | `.scene-label`, `.event-flash` |
| 30 | HUD, Status, Hint | `.hud`, `.status`, `.hint` |
| 40 | Memory theatre (blob + cartoon) | `.theatre` |

Grid: none. Positioning is `fixed` + flex for stage. No external CSS.

### Portrait geometry

- Frame: `min(28vw, 320px)`, aspect 1:1, `border-radius: 50%`.
- Inner shadow stack: `0 18px 40px -15px rgba(90,60,40,.45), 0 6px 14px -6px rgba(90,60,40,.25), 0 0 0 6px rgba(255,246,236,.9), 0 0 0 7px rgba(201,164,134,.5)`.
- `.collide` (wedding): swaps outer halo to `0 0 40px 12px rgba(255,150,160,.55), 0 0 80px 20px rgba(255,200,140,.45)`.

### Memory theatre

- `360 × 300` at `right:20 / bottom:68`.
- `drop-shadow(0 24px 40px rgba(90,60,40,.28)) drop-shadow(0 8px 16px rgba(90,60,40,.18))`.
- SVG blob 11 points, radius `96 ± 14`, morph speed `.00028`.
- Inner canvas radial mask: `radial-gradient(ellipse at center, #000 62%, transparent 82%)`.
- Red tape dot `#d87888` · halo `rgba(216,120,136,.25)` · 2s pulse.

### Responsive

`@media (max-width: 768px)` (`index.html:161`):
- `.portrait { width: 40vw }`
- `.hud, .status { font-size: 10px; max-width: 44vw }`

---

## 7. Motion & Interaction

### Scroll physics (`index.html:237`)

Custom wheel/touch handler with eased RAF interpolation. Not framework-driven.

| Constant | Value | Meaning |
|---|---|---|
| `MIN_FACTOR` | `0.0025` | deep crawl floor |
| `MAX_FACTOR` | `2.40`   | max flick ceiling |
| `LOW_MAG` | `4`     | delta below = floor |
| `HIGH_MAG` | `220`   | delta above = ceiling |
| `CURVE` | `2.8`   | small-input shaping exponent |
| `LERP` | `0.09`  | RAF smoothing |
| `IMPULSE` | `0.42`  | per-event push |
| `FRICTION` | `0.90`  | coast decay |
| `VEL_MIN` | `0.06`  | stop threshold |

Shift+wheel reserved for season offset (pass-through).

### Timings

- Portrait shadow: `.8s ease`.
- Event flash: `opacity .6s ease`.
- Theatre show/hide: `opacity .5s, transform .5s`.
- Tape pulse: `2s infinite`.
- Memory blob morph: continuous (`SPEED = 0.00028`).

### Easing

`easeInOut`, `smoothstep`, `clamp`, seeded `prand()` — see `life.js`.

---

## 8. Iconography & Shapes

- **No icon font.** Glyphs: `↕`, `⇄`, `♥`, `✦`, `kbd` boxes.
- All scenery drawn via Canvas2D primitives (arc/rect/quadratic/bezier).
- Rounded rectangles on torsos (`roundRect(…, 8)`).
- Blob uses bezier interpolation across 11 polar points with triple-sine jitter.

### Border radii

| Token | Value | Use |
|---|---|---|
| round | `50%` | portraits, dots |
| card | `12px` | HUD, status |
| flash | `14px` | event flash |
| pill | `999px` | hint, scene-label |
| rounded rect | `4–8px` | kbd, torso |

---

## 9. Seasons → Months Mapping

| Season idx | Months | Name |
|---|---|---|
| 0 | Dec, Jan, Feb | Winter |
| 1 | Mar, Apr, May | Spring |
| 2 | Jun, Jul, Aug | Summer |
| 3 | Sep, Oct, Nov | Autumn |

Weather pools per season (`life.js:90`):

- Winter: snow×3, mist, cloudy, clear, snow, storm
- Spring: petals×3, clear, pollen, cloudy, rain, petals, mist
- Summer: clear, pollen, haze, rain, storm×2, fireflies, cloudy
- Autumn: leaves×3, rain×2, cloudy, mist, storm

Sun-cycle: 1 full day per 5 in-sim months. Night currently disabled.

---

## 10. Content & Voice

- All-lowercase in README + hints, except proper nouns.
- Italics for emotional beats ("Our *Life*, scrollable.").
- Uppercase + wide tracking only for meta/HUD/kbd.
- Copy leans poetic-minimal, punctuated with `✦` and `×` separators.

---

## 11. Assets

| Path | Use |
|---|---|
| `assets/ankit.jpg` | Ankit portrait |
| `assets/shreeya.jpeg` | Shreeya portrait |
| `assets/brightness-map.json` | preloaded luminance map (scroll choreography) |
| `scraps/preview.png` | social preview |
| `scraps/*.napkin` | design sketches |

---

## 12. Quick Reference — Swatches

```
INK          #2a1c14   primary text
INK-SOFT     #5a4838   secondary text
MUTED        #a89480   tertiary
CREAM        #fff6ec   page bg
CREAM-DEEP   #f2e1c8   gradient end
CLAY         #c9a486   border / accent
TERRACOTTA   #c46848   love accent
ROSE         #d87888   pulse dot
SAGE         #9cae94   Shreeya dress
BLUE         #5b8bb5   Ankit shirt
NAVY         #3a4a5c   Ankit pants
WOOD         #6b4a32   trunks
SHOE-DARK    #3a2418   feet / dark ink
```

— every pixel a heartbeat.

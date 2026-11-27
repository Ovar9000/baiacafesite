# BAIA website brief

Draft, 2026-11-27. Edit freely: this page is the test every change is held against.

## What the site is

BAIA is one of the only places on Burias Island with a website. So the site
is more than a café page: it is a lens through which Burias is seen. People
who have never heard of San Pascual should finish scrolling knowing what the
island looks like, why BAIA is worth the trip, and how to get there.

## Who it is for

1. **Visitors deciding whether to come.** From mainland Masbate, Luzon, or
   abroad (balikbayans). They need to see the place, trust it, and find
   their way: what it looks like, where it is, when it is open, how to get there.
2. **Regulars and locals.** They need the menu and prices, what is new, and
   their loyalty card. Fast, on a phone.

The café does well without the site. The site does not have to sell; it has
to show, honestly, and make coming easy.

## How it should feel

Sitting on the sand at golden hour, looking out at the bay. Local, unhurried,
honest. Real photos taken here, real facts, plain words. No gimmicks: the
island is the spectacle.

## The rules

- **Burias first, features second.** Each homepage section either helps someone
  decide to come or helps them once they are here. Anything else gets its own
  page or a quiet link.
- **One bold thing per screen.** The hero tagline, "Coffee by the Bay", is the
  loud moment. Everything around it stays calm.
- **Real details over adjectives.** Asin Tibuok salt from Bohol, free
  skimboards, the floating cottage from ₱2,000, golden hour around 4:45–6:00 PM.
  Not "artisanal", "gourmet", "sizzling".
- **Photos are the brand.** Our own photos of Burias, full and sharp, with a
  plain caption saying what and where.

## Look

One palette everywhere, card included: bay blues on sand. No orange, no
black. Blue next to orange was harsh; one family keeps every page feeling
like the same place.

| Token | Value | Use |
| --- | --- | --- |
| BAIA blue | `#1E4AFF` | The logo colour. Buttons on sand and white; links. |
| Bay navy | `#16255C` | Text, dark sections. |
| Night navy | `#0E1A45` | The footer and the deepest backgrounds. |
| Sand | `#F5E9D6` | The page's paper. Buttons on navy and on the photo. |
| Light bay blue | `#AFC2FF` | Small coloured text and focus rings on navy. |
| White | `#FFFFFF` | Cards, polaroid frames. |

**Actions** use one token, `--action`, that adapts to what it sits on: BAIA
blue with white text on sand and white, sand with navy text on navy and on
the hero photo. `--accent` does the same for small coloured text. The only
other colours are the open/closing/closed status dots and the hero's
fireflies.

**Type.** DynaPuff (the BAIA letters font) for the tagline, and only there.
Outfit for everything else, at a few weights. Caveat only as handwriting on
photo captions. No other faces.

**Structure.** No small all-caps labels above headings. No clutter on the
hero: no address line, no live status. One corner size for cards.

**Motion.** Spent in one place, the hero, as one sequence: the photo settles
then drifts slowly; the tagline's letters float up one after another and keep
bobbing in a slow wave; the buttons arrive last, down on the sand on
phones (the round menu button waits off-screen until the page scrolls, so
they have the bottom of the screen to themselves); at night fireflies glow
around the lantern tree; scrolling away lifts the words off. The wave strip
under the hero drifts too. Everything else moves only when someone taps it,
and nothing moves for anyone who asks for reduced motion.

**Header.** On phones and tablets the bar splits into two floating pieces of
clear liquid glass: the BAIA pill (logo + BAIA in DynaPuff) and the
loyalty-card button. The round menu button and the hero's "Getting here" are
the same glass. The glass has no added lighting (no highlights, rim light or
glow): its depth comes from a fine edge, two soft shadows, and a press that
swells and springs back. Chromium browsers also bend the page behind the
glass edges; Safari shows the same glass without the bend. Over the cream
sections the glass turns light with navy text, as a slow cross-fade, never
a blink. On desktop the header stays one bar and does not change tone.

**Footer.** "Visit BAIA" is the last section and follows the same pattern
as the others: title and address as the header, then the hours card beside
Messenger, Instagram and the loyalty line, then one strip with the
copyright and the other pages.

**Loyalty card** (`/card/`). A paper stamp card, like the printed card at
the counter: sand paper, navy ink, ten printed circles, each stamp pressed
in BAIA blue ink. The page around it is the same sand and navy as the
homepage, with the blue BAIA logo, so going from the site to the card
never jumps to black. Same 10-stamp rules; bonus stamps sit on top.

## Type and spacing rules

These live as tokens in `src/styles/system.css`. Change a token there, not a
section's own stylesheet.

**Type scale** (steps of about 1.25 from a 17px body)

| Token | Size | Use |
| --- | --- | --- |
| hero tagline | 52→132px | "Coffee by the Bay" only. DynaPuff. |
| `--text-title` | 32→52px | Section titles. Outfit 800, sentence case. |
| `--text-xl` | 20→24px | Card titles. |
| `--text-lg` | 18→21px | The lede under a section title. Outfit 500. |
| `--text-base` | 17px | Body copy. Line height 1.6. |
| `--text-sm` | 15px | Photo captions, small UI. |
| `--text-xs` | 13px | Badges and meta only. |

Lines stay short: ledes at most 52 characters wide, body at most 62.

**One content column.** Everything sits in one column, 1280px wide at most
including its side padding (16px on phones, 20→72px on bigger screens).
Section titles, ledes and content all start on the same left edge. Nothing
inside a section narrows and re-centres itself.

**Every section follows the same pattern**

```html
<section class="page-section" data-theme="sand">
  <div class="container">
    <div class="section-head">
      <h2 class="section-title">The menu</h2>
      <p class="section-lede">One or two plain sentences.</p>
    </div>
    …content…
```

**Spacing rhythm**

- Section top and bottom: `--space-section`, 64→120px.
- Two sections in a row on the same background read as one stretch:
  the second starts after only `--space-section-join`, 16→32px.
- Section header to its content: `--space-head`, 28→48px.
- Title to lede: 14px.

## Homepage order

Backgrounds alternate sand and navy, so each section reads as its own
chapter and the page has a steady rhythm.

| # | Section | Background |
| --- | --- | --- |
| 1 | **Hero.** The beach as it looks right now (time of day in Manila) and "Coffee by the Bay". Nothing else. The words sit top-left in the open sky, so the scene stays clear. | photo |
| 2 | **Burias, through our lens.** The island in our own photos, as one compact mosaic. | sand |
| 3 | **The shore.** Skimboards, snorkel masks, the floating cottage: the water right after the island. | navy |
| 4 | **About BAIA.** Who we are, with the crew polaroids. | sand |
| 5 | **The BAIA family.** Guest photos from Facebook. | navy |
| 6 | **House signatures.** Three things to try first. | sand |
| 7 | **The menu.** With ordering. | navy |
| 8 | **What is new.** The latest three posts. | sand |
| 9 | **Visit.** Hours, map, how to get here. | navy |

## Not decided yet

- How to get to Burias: the ferry routes and times we can stand behind
  (Starhorse and others), and from which ports. Needs facts from Mark before it
  goes on the page.
- Which more photos of Burias to add (the town, the people, the food market,
  other beaches).

# Changelog

What changed on baia.cafe, newest first, in plain words.

## 2026-10-10: Experience-first redesign

The homepage now leads with the place itself (the shore, the photos, the
sunsets), and the features (ordering, loyalty, drops) sit where they belong
instead of competing for attention. The look and feel follow iPhone (iOS 26/27
"Liquid Glass") conventions, since most visitors are on iPhones.

### Homepage order
- New order, following a day at BAIA: hero → About & photos → The Shore →
  House Signatures → Menu → What's New → Visit.
- The header menu and the phone drawer follow the same order.

### Hero
- The hero photo matches the time of day at the beach (Manila time): sunrise
  (5–8 AM), the blue morning with the boat (8 AM–4 PM), sunset (4–6:30 PM),
  and the lit-up café tree after dark. Only the matching photo is downloaded.
- Each photo has its own focal point so the subject stays in frame on any
  screen shape; upright tablets get the tall crop.
- The rotating drink card, the floating icons and the open-status chip were
  removed from the hero.
- Link previews on Facebook and Messenger now show the shore instead of a drink.

### Header and navigation
- The header is a floating glass capsule (after the Lot 7 site) with a
  magnifying "lens" that glides to the section you're in, and hides over
  sections that have no menu link (like House Signatures).
- The logo is a circle that sits concentric with the capsule's rounded end.
- Phones get a menu button and a slide-in glass drawer with all sections,
  Messenger, live open/closed status and the location. Before, phones had no
  section navigation at all.
- The loyalty card moved out of the header text into a single card icon, plus
  one quiet line in Visit. It was removed from About and the hero.
- The phone bottom bar is a floating glass tab bar (Menu, What's New) with
  My Order beside it. It appears once you reach the Menu, or as soon as your
  order has something in it.

### Sections
- About: the "100%" stats row and loyalty button were removed; two new photos
  (stars over the tree, an evening walk) joined the photo strip.
- House Signatures: three compact cards (a swipeable row on phones) instead of
  three full posters. About a quarter of the height on phones.
- New Drops is now **What's New**: the latest three posts near the end of the
  page, with a link to the rest on Facebook. Filter tabs and the extra
  Messenger banner were removed. Old events still hide themselves after a week.
- Floating Cottage has its own page at **/floating-cottage/** (rates,
  inclusions, guidelines, the official rate poster, booking). The homepage
  shows a short teaser card. Old /floating-cottage links now land there.

### Menu
- Drinks / Food switch, a search field that looks across both, and
  swipeable category tabs that stay pinned under the header while you scroll.
- One category at a time: a compact list on phones, a grid of tiles on
  laptops (2 columns, 3 on wider screens) with the controls side by side.
- Each item shows its name, one line of description, the price and a round
  + button.
- Drink options (temperature, size, add-ons) open in a bottom sheet with
  sliding segmented controls and a live total.

### Ordering
- Adding something no longer opens My Order, so you can keep browsing and
  add several things in a row. A banner confirms each add (with a View
  button), the + button pops and the My Order count bumps.
- My Order is an iPhone-style sheet: a bottom sheet you can swipe down to
  close on phones, a floating panel on laptops.
- Order type is a segmented control; items are one clean list with a filled
  quantity stepper and a trash icon; Clear moved to the header.
- The delivery form matches the sheet.
- The confirmation step is a "Review & send" sheet with grouped rows, the
  total, one Messenger button and a "Copy order text instead" link.
- Notifications drop in at the top like iOS banners, so they never cover
  the total or the send button.

### Look and feel
- One corner scale across the site: 8px tags, 14px fields and rows, 24px
  cards, and pill shapes only for things you tap.
- Heavy headlines got slightly looser letter spacing so letter pairs like
  F–T no longer touch.
- The floaties no longer follow the mouse; they just bob in place.
- The search field shows one soft focus ring around the whole field instead
  of an amber box around the text inside it.
- Earlier on this branch: glows replaced by one shared shadow scale, and more
  liquid-glass floaties across sections.

### Behind the scenes
- New photos are compressed for the web; the full-size originals are not
  shipped. The images folder is about 4 MB.
- Removed code and styles that no longer had anything on the page using them
  (hero drink card, accordion menu, old order modal, filter tabs).

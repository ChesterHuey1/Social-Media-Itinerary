# Decisions that change the spec

The spec ("Pinpoint: Travel Planner Spec", Oct 24, 2026) is still the source of truth. This file lists every place where the build differs from it, and why. When the two disagree, this file wins.

## Data model

These change the tables in the spec's "Data model and architecture" and "Flights and hotels" sections. Part 2 creates the tables from this list.

### Stops store order, not times

A stop stores what the user controls. Arrival times are computed from the order, the travel legs and each stop's time spent, so a reorder can never leave a stale time behind.

| Table | Columns |
|---|---|
| stops | id, day_id, place_id, position, title (null shows the place name), color, objectives, stay_minutes, stay_source (`estimate` or `user`), locked_at (null when not locked) |
| legs | from_node, to_node, depart_hour, mode (`walk` or `transit`), minutes, distance_m, line, fare_usd, source (`routes` or `estimate`), fetched_at |

The spec's `stops.minutes`, `minutes_source` and `locked` become `stay_minutes`, `stay_source` and `locked_at`. A route node is a place id or a stay id. A pair with no leg in the table gets a straight-line estimate, shown with a `~`.

### Trips have no single city

`trips.city` is removed. Each day's city comes from the stay that covers that night, so a Tokyo and Kyoto trip needs no special case.

### Saved places have a status

The saved list is per user, and a place saved after a trip is built must still reach that trip.

| Table | Columns |
|---|---|
| saved_places | id, user_id, place_id, source (`reel` or `search`), status (`new`, `in_trip`, `dismissed`), created_at |
| saved_post_places | saved_post_id, place_id |

`saved_post_places` links each post to the places found in it, so one restaurant saved from two Reels is one place with two posts.

### Airport transfers

| Table | Columns |
|---|---|
| airport_buffers | iata_code, international_min, domestic_min, source |
| transfers | id, trip_id, flight_id, stay_id, direction (`arrive` or `depart`), mode (`train`, `bus`, `rideshare`), depart_at, arrive_at, minutes, fare_usd, fare_source, summary, picked, fetched_at |

`flights` gains `buffer_min` (null uses the airport's value) and `big_luggage`. The arrival day starts when the picked transfer arrives at the hotel.

### Place facts wait for Part 4

For now `places` keeps cost and tip in its own columns, each with its source. The spec's `place_facts` table, one row per value with the page it came from, arrives in Part 4 with the fill-in pipeline that writes it.

### Budget

- Categories are Flights, Stay, Food, Tickets and Transit. The spec listed four but filed flight costs under Flights.
- Flight and stay costs live on their own rows and count toward the budget. They are not copied into `expenses`, so each amount has one writer.
- `expenses` gains `fx_rate` and `fx_date`, the exchange rate used and its date.

## Airport transfers

After landing, the app lists real ways to reach the hotel and lets you pick one.

1. Ready time = landing time + the airport's buffer. The default is 1 h 30 m international and 1 h domestic, and you can change it per flight.
2. Google Routes at the ready time returns train options (transit, trains only), bus options (transit, buses only) and drive time with traffic for a taxi or Uber.
3. The taxi or Uber price is an estimate from distance and time, labeled "estimated". An "Open in Uber" link fills in the hotel so the real price shows in Uber.
4. **Default pick:** the cheapest option within 15 minutes of the fastest. With `big_luggage` set, options with transfers rank lower. If no train or bus runs at that hour, only taxi or Uber shows, with the reason.
5. **Flight delays:** changing the landing time recomputes the options and shows a warning on Day 1. It does not re-plan the day on its own, which matches the rule that nothing moves until you act.
6. Departure day works in reverse: hotel to airport, arriving 3 h before an international flight or 2 h before a domestic one.
7. **Out of v1:** live flight status, which needs a paid flight-data service.

Until API keys exist, all searches return mock options.

## Usability

| Problem | Decision |
|---|---|
| Places saved after the trip is built have nowhere to go | The sidebar shows a count of `new` saved places. Each one offers "Add to Day N" or "Backlog". |
| Optimize route throws away a manual order | An Undo toast shows for 10 seconds after optimizing. Locked stops never move. |
| Moving a stop to another day takes two steps | Each stop gets "Move to Day…", which checks the hours on the target day. |
| Rebuilding the itinerary is undefined | Rebuild places only new and backlog places, never moves locked stops, and shows a preview first. |
| Dragging is hard on a phone | The up and down arrows stay visible on every card. |
| "Name it" for an unmatched post leads nowhere | A panel shows the post's image and caption with a place search. |

## Look and feel

This replaces the spec's "UI specification" colors, type and component shapes. The layout, the three columns and their breakpoints, the spacing scale, and the screen flow stay as the spec has them.

- **Cards with clear edges.** White cards with a soft shadow and one corner radius on a pale green-gray page. No outlines.
- **Palette: white and green.** Forest green `#2F6B4F` marks the one next step: the primary button, the active day, transit lines. Terracotta appears only on warnings. Every text and background pair passes 4.5:1.
- **Fonts:** Fraunces for titles and Figtree for everything else.
- **Little subtext.** No helper text under fields, no dot-joined meta lines, no uppercase labels. Facts use short labels: Hours, Cost.
- **Day totals:** one line under the day title, and an itemized breakdown after the last stop.
- **Spacing:** only the nine values in the spec (4, 8, 12, 16, 20, 24, 32, 48, 64 px). `npm run lint` fails on any other value.

The mockups are on the design canvas: https://claude.ai/artifact/5UGG4mWZAck7nU58SxcTnD

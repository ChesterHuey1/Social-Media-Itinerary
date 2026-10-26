# Pinpoint

A trip planner that turns places you DM to an Instagram bot, or search for on the site, into a day-by-day itinerary.

## Run the frontend

```sh
cd frontend
npm install
npm run dev      # http://localhost:5173
npm test         # domain tests
npm run lint     # oxlint, including the useEffect ban
```

The app runs on sample data in `frontend/src/mocks/demoTrip.ts` until the backend exists.

See [docs/decisions.md](docs/decisions.md) for where the build differs from the original spec.

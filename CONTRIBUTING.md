# Contributing

Thank you for helping keep Lightmap small, calm, and welcoming.

1. Create a focused branch and pull request.
2. Run `npm ci --prefix functions` and `npm run check`.
   When changing `database.rules.json`, also run `npm run test:rules`
   (requires a Java runtime for the database emulator).
3. Explain user-visible behavior, privacy implications, and deployment changes.
4. Do not commit `public/config.js`, `google-services.json`, location data, or
   credentials.

Please propose substantial interface or product changes in an issue before
implementing them. Accessibility, security, performance, and small correctness
improvements are especially welcome.

# Project Rules

## Project Purpose

A tablet-friendly student work-zone portal for children completing daily learning assignments.

## Student Workflow

- Students may choose their zones in any order.
- The interface must not force a fixed sequence.
- Only one zone timer may run at a time.
- Starting another zone pauses the currently active zone.
- Students may pause and resume zones.
- The student interface should use simple Spanish.
- Buttons must be large and touch-friendly.
- Do not rely on hover interactions.
- External learning websites should normally open in a new tab.
- The portal must preserve progress when the student returns.

## Privacy and Safety

- Users include minors.
- Do not implement screenshots, webcam capture, screen recording, keylogging, or collection of unnecessary personal information.
- Do not store passwords for external learning websites.
- Do not describe timer time alone as proof that academic work was completed.
- Use the term recorded work time unless completion is separately verified.

## Development

- Use TypeScript strict mode.
- Inspect existing code before editing it.
- Make small, focused changes.
- Do not rewrite unrelated files.
- Never expose secrets or service-role database keys in browser code.
- Run linting, type checking, tests, and a production build when possible.
- Report commands run, files changed, limitations, and unresolved issues.

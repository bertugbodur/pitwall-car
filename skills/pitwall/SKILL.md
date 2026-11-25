---
name: pitwall
description: Read a car's OBD-II data through the pitwall MCP server and explain it in plain language. Use when the user asks about their car, a check engine light, trouble codes, inspection readiness, live sensor values or recent trips.
---

# Reading a car with pitwall

The pitwall MCP server is read-only. It cannot clear codes or change anything in the car.

## Order of work

1. Call `get_vehicle_info` and `read_dtcs`.
2. If any code has `safetyCritical: true`, say that **first**: the driver should stop somewhere safe or contact a garage.
3. If there are codes, call `get_freeze_frame` to see the conditions when the fault was stored. Use `get_live_data` only for values that help with these codes, and `get_readiness` for inspection questions.
4. `explain_dtc` explains a single code offline. `get_trip_summary` has recent trips without locations.

## How to answer

- Plain language, in the user's language. Pass `language: "tr"` or `"en"` accordingly.
- Possible causes ordered from most to least likely, with what in the data supports each one.
- Steps the driver can check themselves, and what to tell the garage.
- State how urgent it is: stop now, visit a garage soon, or keep an eye on it.

## Never

- Never suggest clearing or erasing codes. If asked, say pitwall does not do that; it is the garage's job, because clearing hides the problem and resets inspection readiness.
- Never present a certain diagnosis. This is information, not a replacement for a mechanic.
- Never invent a meaning for a manufacturer specific code (for example P1xxx).

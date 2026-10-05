# Guardian — code review findings

**Author:** Graeme Thomas  
**Module:** `guardian-access-control` v1.1.0

A review pass over the whole module. Eleven issues found, all fixed, each with a
regression test in [`src/test/accessHardening.cjs`](../src/test/accessHardening.cjs).
Known limitations that are *not* bugs are listed at the end.

---

## Findings

### 1. Break-glass skipped the account status check — **security**

`invokeBreakGlass()` checked the capability and the justification but never
whether the account was still active. A suspended or deactivated user holding a
valid unexpired token could take emergency access to any patient.

The normal read path checks status inside the policy engine, but break-glass
writes its own grant and bypasses that path entirely, so it has to check for
itself. Now returns 403 `SUBJECT_INACTIVE`.

### 2. A wildcard permission was a one-request escalation — **security**

`isKnownPermission('*')` returns true, so anyone holding `access.matrix:manage`
could `PUT /roles/{their-own-role}` with `permissions: ['*']` and collect every
capability in the system in a single call — including `access.breakglass:use`
and `access.grant:manage`.

It did not confer `unscoped`, so patient scoping still held, but it was still a
clear privilege escalation. Wildcards now require the actor to be unscoped
already: 403 `WILDCARD_FORBIDDEN`. This was the fourth route to the same
outcome; the other three were already guarded.

### 3. A negative break-glass window closed before it opened — **logic**

```js
Math.min(Number(minutes) || settings.breakGlassMaxMinutes, settings.breakGlassMaxMinutes)
```

`minutes: -30` is truthy, so `Math.min(-30, 60)` returned `-30` and `validUntil`
landed in the past. The request returned 201 and the grant conveyed nothing — a
silent failure at exactly the wrong moment. A non-numeric value produced `NaN`
and an Invalid Date, with the same result.

Now clamped to a positive value at or below the configured ceiling, with the
ceiling itself validated in case `ACCESS_BREAKGLASS_MINUTES` is set to nonsense.

### 4. An unparseable date became "never expires" — **logic**

`policy.toDate()` deliberately treats an unparseable date as *no bound*, so a
corrupt stored record can never harden into a denial and lock people out of
patient data. That is right for the read path and wrong for input validation:
`validUntil: 'next tuesday-ish'` was accepted and produced a grant that never
expired.

Input parsing is now separate and strict. Invalid → 400 `INVALID_DATE`. Already
past → 400 `GRANT_ALREADY_EXPIRED`. Before `validFrom` → 400
`INVALID_DATE_RANGE`. The order matters: when `validFrom` is omitted it defaults
to now, so every past `validUntil` would otherwise be reported as a range error,
which is true but useless.

### 5. Force-deleting a role left dangling assignments — **data integrity**

`DELETE /roles/{name}?force=true` removed the role but left every
`UserRoleAssignment` pointing at it. Those users kept an assignment to a role
that no longer existed; the resolver reported it as a missing parent forever.

Assignments are now revoked as part of the deletion, with the reason recorded,
and the response reports `revokedAssignments`. Primary holders (`User.role`)
cannot be cleaned up from here, so the count comes back as
`orphanedPrimaryHolders` for the caller to fix on the user record.

### 6. `suspended` reported the wrong reason code — **accuracy**

`classifyGrant()` mapped both `revoked` and `suspended` to
`DENY_GRANT_REVOKED`. Operationally these are different — suspended is
reversible, revoked is not — and the audit log could not tell them apart. Added
`DENY_GRANT_SUSPENDED`.

### 7. `requirePermission` audited denials but not grants — **audit gap**

The patient-scoped path logs both outcomes. The pure-RBAC middleware logged only
failures, so successful use of an administrative endpoint left no trace at all.
"Who read the grant register last Tuesday?" was unanswerable.

Now logs both, honouring the same `auditAllows` setting, with reason
`ALLOW_ROLE_CAPABILITY`.

### 8. `isValidId` could throw on some inputs — **robustness**

mongoose's `ObjectId.isValid()` accepts *any* 12-character string, so
`'not-an-obj-i'` passes it. The round-trip comparison catches that, but
constructing the ObjectId can itself throw for some inputs that pass `isValid`,
and the throw happened before the comparison — turning a malformed id in a URL
into a 500 instead of a clean 403. Now wrapped.

### 9. Console `esc()` did not escape single quotes — **XSS**

Several tables interpolate ids and role names into single-quoted `onclick`
handlers. `esc()` escaped `&`, `<`, `>` and `"` but not `'`, so a value
containing an apostrophe could break out of the attribute.

Low practical risk — ids are hex and role names are validated against
`[a-z0-9._-]` — but the escaping function should not depend on its callers
having validated their input. Fixed.

### 10. Documented decision order did not match the code — **documentation**

The header comment in `policy.js` claimed break-glass was evaluated as step 3
and explicit grants as step 4. The implementation iterates the grants once and
returns the first usable one, labelling it by its own `grantType`.

The behaviour is right — both kinds convey exactly the permissions they list, so
there is nothing to rank — but the comment described a precedence that does not
exist. Comment corrected rather than code changed.

### 11. A shadowed identifier, introduced during this very review

Fix 3 declared `const ceiling` inside `invokeBreakGlass()`, where `ceiling` was
already the name of the capability matcher. The module stopped loading entirely.
Caught by the suite on the next run, renamed to `configuredCeiling`.

Noted here because it is the argument for the test suite existing: a review pass
that touches six files is itself a source of defects.

---

## Not bugs — known limitations

These came up in the review and were left alone deliberately.

**Org-wide grant authority.** `getRelatedPatientIds()` includes every patient in
an organisation the actor belongs to, so a doctor can authorise access to any
patient in their org, not only their own caseload. Whether that is right depends
on how Guardian uses `Organization`. Narrowing it is a two-line change in
`assertGrantorOwnsPatient`.

**Grants are transitive.** A doctor holding a live grant on a patient can grant
onward to someone else. Flagged previously; removing the `own`/`usable` check
makes grants non-transitive.

**No cross-tenant check on the read path.** The policy engine does not compare
the subject's organisation with the patient's. Grants are explicit, so this only
matters if an unscoped admin should be scoped to one organisation.

**`requirePatientAccess` accepts `id` as a patient-id source.** Convenient on
`/patients/:id`, wrong on `/users/:id`. Pass `{ sources: ['patientId'] }` on any
route where the bare `id` means something else.

**Audit failures are swallowed.** A failed audit write logs to console and the
request proceeds. That trades completeness of the log for availability of care
data. Worth revisiting if you are subject to a "no access without a recorded
audit" control.

**The offline demo server has no rate limiting and `cors: *`.** It is a test
harness, not a deployment. The real `server.js` keeps its own middleware.

**`verifyRole` is not multi-role aware.** A user given a second role through an
assignment passes `requirePermission` checks for it but still fails
`verifyRole` checks, because `verifyRole` only ever reads `User.role`.
Documented in [`RBAC.md`](RBAC.md).

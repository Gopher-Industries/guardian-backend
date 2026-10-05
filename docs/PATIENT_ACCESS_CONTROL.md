# Guardian — patient-scoped authorisation

**Author:** Graeme Thomas  
**Module:** `guardian-access-control` v1.1.0

**Requirement:** a system user may view patient data, but only for the patients a
doctor or an administrator has authorised them to view.

---

## 1. Why a permissions matrix on its own does not answer this

A permissions matrix answers *"what kind of thing may this user do?"* — read a
record, write a prescription, edit a care plan. It is the right tool for that
question and Guardian needs one.

It does not answer *"for which patient?"*, and that is the question the
requirement is actually asking. Three ways of stretching a matrix to cover it,
and why each fails:

| Approach | Why it fails |
| --- | --- |
| One permission per patient (`patient:read:66f1a2…`) | The permission catalogue grows with the patient population. Ten thousand residents is ten thousand permission codes per action. Unqueryable, unreviewable, and the role matrix stops meaning anything. |
| A dense user × patient boolean matrix | 500 staff × 10,000 patients is five million cells to store and reason about, almost all of them `false`. Worse, a boolean has no lifecycle: you cannot record who authorised it, why, when it lapses, or who took it away. |
| Roles-per-patient (`nurse-of-ward-4`) | Works until someone needs access to one patient outside their ward. Then you are inventing a role per exception, and role explosion sets in within a month. |

The problem is not that the matrix is the wrong shape. It is that **authorisation
here has two independent dimensions**, and a single table can only hold one.

The capability dimension is full RBAC — role inheritance, multi-role membership
with union semantics, and a role lifecycle. It is documented separately in
[`RBAC.md`](RBAC.md); this document covers the scope dimension.

## 2. The model: capability × scope

```
       CAPABILITY                          SCOPE
  "what kind of action?"            "for which patient?"
   RolePermissionSet                PatientAccessGrant
   role -> permission codes         (user, patient) -> permissions, with a lifecycle
   + inheritance                    + who granted it, why, until when
   + multi-role union
            │                                  │
            └───────────── AND ────────────────┘
                            │
                     access allowed
```

A request is permitted only when **both** layers agree. That gives you two
properties worth having:

- **A grant can never escalate a role.** The permissions conveyed by a grant are
  intersected with the recipient's role capabilities at issue time. Granting
  `patient.prescription:write` to a user whose role is read-only silently drops
  it and reports what was dropped. A compromised or careless grantor cannot turn
  an analyst into a prescriber.
- **A role change takes effect everywhere at once.** Removing
  `patient.vitals:read` from the nurse role closes vitals for every nurse
  immediately, without touching a single grant.

### The scope layer is a sparse ACL, not a dense matrix

`PatientAccessGrant` stores only the pairs that are actually authorised. Each
document is one sentence:

> *user X may do Y to patient Z, authorised by W, because R, until T.*

```js
{
  subject:       ObjectId('…analyst'),
  patient:       ObjectId('…alice'),
  permissions:   ['patient:read', 'patient.vitals:read'],
  grantType:     'explicit',
  status:        'active',
  validFrom:     2026-09-08T00:00:00Z,
  validUntil:    2026-09-15T00:00:00Z,   // null = open-ended
  grantedBy:     ObjectId('…drHouse'),
  grantedByRole: 'doctor',
  reason:        'Falls analysis for the September safety report',
  purpose:       'direct-care'
}
```

Everything the boolean cell could not carry is here: provenance, justification,
purpose of use, an expiry, and a soft revocation that keeps the history. In a
health context those fields are not decoration — they are the answer when a
patient asks who has been looking at their record.

Indexes make it cheap in both directions:

- `{ subject: 1, patient: 1, status: 1 }` — the enforcement hot path.
- `{ subject: 1, status: 1, validUntil: 1 }` — "every patient this user can reach", for list scoping.
- `{ patient: 1, status: 1 }` — "who can see this patient", for the console and for privacy enquiries.

## 3. Decision order

Implemented in `src/access/policy.js`, first match wins:

| # | Check | Outcome |
| --- | --- | --- |
| 0 | Subject resolvable and active? | else `DENY_SUBJECT_UNKNOWN` (401) / `DENY_SUBJECT_INACTIVE` |
| 1 | Does the role carry this permission at all? | else `DENY_ROLE_LACKS_CAPABILITY` |
| 2 | Is the role unscoped (administrator)? | `ALLOW_ROLE_UNSCOPED` |
| 3 | Live break-glass grant? | `ALLOW_BREAK_GLASS` |
| 4 | Live explicit grant covering this permission? | `ALLOW_EXPLICIT_GRANT` |
| 5 | Care relationship, if relationship mode is on? | `ALLOW_RELATIONSHIP` |
| 6 | — | `DENY_NO_GRANT` |

Every denial carries a specific reason code rather than a generic 403 body.
`DENY_GRANT_EXPIRED` and `DENY_NO_GRANT` are operationally very different
problems and the log has to be able to tell them apart. When several grants
exist and none apply, the engine reports the *closest near miss*, so
"their grant expired yesterday" does not read as "they never had access".

### Strict mode versus relationship mode

`allowRelationshipAccess` (env: `ACCESS_ALLOW_RELATIONSHIP`) controls step 5.

- **`true` (default, backwards compatible)** — being the assigned doctor, an
  assigned nurse or the caretaker of a patient is itself an authorisation. This
  matches Guardian's existing `utils/patientAccess.js` behaviour, so the module
  can be introduced without changing who can see what on day one.
- **`false` (strict)** — care relationships grant nothing. *Only* an explicit
  grant opens a record. This is the mode the requirement describes, and the mode
  the test suite runs in by default.

Migrating from one to the other is a data exercise, not a code change: write a
grant for each existing relationship, verify against the audit log, then flip
the flag.

## 4. Break-glass

Emergency access is self-service, immediate, always time-boxed
(`ACCESS_BREAKGLASS_MINUTES`, default 60), and requires a written clinical
justification of at least ten characters. It writes a `breakglass.invoked` audit
event and produces a normal grant of `grantType: 'break-glass'` that expires on
its own.

This exists for a practical reason. A system with no emergency valve gets one
anyway — it is called sharing a login, and it destroys the audit trail entirely.
A loud, bounded, attributable override is strictly safer than the workaround it
prevents.

## 5. Audit

`AccessAuditLog` is append-only and records:

- `access.decision` — every allow **and** every deny, with the reason code, the
  permission, the request path and the IP.
- `grant.issued`, `grant.revoked`, `matrix.updated` — every administrative change.
- `breakglass.invoked` — separately, so emergency access can be reviewed as its
  own queue.

Logging failures never break the request path: an audit write that throws is
logged to the console and the request proceeds. That is a deliberate trade-off —
availability of care data over completeness of the log — and it is worth
revisiting if the deployment is subject to a strict "no access without a
recorded audit" control.

## 6. Information disclosure

With `maskUnknownPatient` on (the default), "this patient does not exist" and
"you are not authorised for this patient" return the same 403 with the same
message. Otherwise the API is a patient-identifier oracle: anyone with a token
could walk identifiers and learn which ones are real. The true reason
(`DENY_PATIENT_UNKNOWN` versus `DENY_NO_GRANT`) is still recorded in the audit
log, where it is useful and not exposed.

## 7. Who may authorise

Issuing and revoking grants requires the `access.grant:manage` capability *and*
`canGrant` on the role. On top of that:

- an **administrator** (unscoped role) may authorise any user for any patient;
- a **doctor** may only authorise access to patients under their own care —
  enforced by `assertGrantorOwnsPatient`, which checks the care relationship or
  the doctor's own live grant on that patient;
- everyone else gets 403, including from the read-only grant register.

That last constraint is what stops the mechanism becoming a lateral-movement
tool: a doctor who is compromised can widen access only to their own caseload.

## 8. What this does not do

Worth stating plainly:

- **No patient-directed consent.** The patient themselves is not a party to the
  grant. If Guardian later needs "the resident may exclude a named staff
  member", that is a deny-rule layer on top, and deny would need to beat allow.
- **No purpose-of-use enforcement.** `purpose` is recorded but not evaluated. It
  is there for review, not for control.
- **No delegation chain.** A grant does not convey the ability to re-grant.
- **Grants are per-patient, not per-cohort.** For a ward or a caseload you write
  N grants. If that becomes unwieldy, the natural next step is a `PatientGroup`
  with grants targeting a group id — the policy engine's `grant.patient` check
  is the only thing that would need to widen.
- **Nothing here encrypts anything.** This is authorisation, not
  confidentiality at rest.

# Guardian — RBAC

**Author:** Graeme Thomas  
**Module:** `guardian-access-control` v1.1.0

The capability half of the model. Everything here answers *"what kind of action
may this user ever perform?"* — never *"for which patient?"*, which is
[`PATIENT_ACCESS_CONTROL.md`](PATIENT_ACCESS_CONTROL.md)'s job.

RBAC works entirely on its own. `requirePermission('access.audit:read')` guards
any route that has nothing to do with patients, and none of the patient-scoping
machinery is involved.

---

## 1. Three collections

| Collection | Holds | Notes |
| --- | --- | --- |
| `Role` | `{ name }` | Guardian's existing collection. Untouched, and what `User.role` points at. |
| `RolePermissionSet` | `roleName → permissions[], inherits[], unscoped, canGrant, isSystem` | The capability matrix. Editable at runtime. |
| `UserRoleAssignment` | `(user, roleName)` with provenance and expiry | Additional roles beyond `User.role`. |

`Role` and `RolePermissionSet` are kept in step automatically: creating a role
through the API writes both. Without that, a capability set can exist for a role
no user is able to hold, and it fails silently — the role looks configured and
simply never applies. `migrateRoleAssignments.js` reports and repairs any
existing drift.

## 2. Inheritance

A role may list `inherits: ['nurse']` and pick up everything nurse has,
transitively:

```
senior-nurse  →  nurse  →  base
```

`expandRole()` walks the chain, unions the permissions, and propagates the
`unscoped` and `canGrant` flags upward. Change the nurse baseline and every
descendant moves with it.

Three safety behaviours, all tested:

- **Cycles are refused at edit time.** `wouldCreateCycle()` probes the change
  before it is written and returns 422 with the offending role named.
- **Cycles that somehow exist are broken at read time**, not thrown. A bad
  matrix row must never take the API down. The cycle is reported in the
  `warnings` of `GET /users/{userId}/roles` so the console can show it.
- **A missing parent is reported, not fatal.** The role resolves to whatever it
  can and lists the unknown parent.

Depth is capped at 16. Shipped roles deliberately declare no inheritance —
deep hierarchies are hard to reason about, and the point of the feature is to
let *you* build the two or three levels you actually need.

## 3. Multi-role membership

`User.role` stays exactly as it is. Additional roles live in
`UserRoleAssignment`, and the resolver unions the primary with every live
assignment.

This was a deliberate choice over adding a `roles[]` array to `User`:

- **Nothing existing changes.** `verifyRole(['nurse'])` keeps working, login
  keeps working, and an unmigrated database behaves exactly as it does today.
  The migration is optional and reports before it writes.
- **A membership gets the same treatment a patient grant does** — who assigned
  it, why, and when it lapses. "Priya covers as ward coordinator for the
  fortnight" becomes an expiring record rather than a role change somebody has
  to remember to undo.

Assignments honour `validFrom` and `validUntil`, so a future-dated assignment
does not apply yet and an expired one stops counting with nobody touching it.

### Union semantics

Effective capabilities are the **union** of every role held, each expanded
through its own inheritance chain. `unscoped` and `canGrant` are true if **any**
held role sets them.

Stated plainly, because it is the thing people get wrong: **adding a role can
only widen access, never narrow it.** There is no deny rule and no
"most-restrictive-wins". If a user should lose something, take the role away —
do not add a restrictive role and expect it to subtract.

That is the standard RBAC reading and it is the simplest thing to reason about,
but it does mean a careless assignment is an escalation. Hence the guards below.

## 4. Escalation guards

| Guard | Behaviour |
| --- | --- |
| Only `access.matrix:manage` may touch roles | Doctors hold `access.grant:manage`, not this. They can authorise patients, not mint capabilities. |
| Only someone already **unscoped** may create an unscoped role | Otherwise a role administrator could quietly hand themselves the keys. |
| …or mark an existing role unscoped | Same reasoning. Returns 403 `UNSCOPED_FORBIDDEN`. |
| …or assign an unscoped role to anyone | Closes the third route to the same outcome. |
| System roles cannot be deleted | `isSystem: true` on the five shipped roles. |
| A system role that is unscoped cannot be made scoped | Stops an administrator locking everyone out of administration. |
| A role still held cannot be deleted | 409 `ROLE_IN_USE` with the count, unless `?force=true`. |
| A role other roles inherit from cannot be deleted | 409 `ROLE_HAS_DESCENDANTS`, naming them. |
| A user's primary role cannot be removed through assignments | 422 — change it on the user record, where it belongs. |

Every one of these is a separate test in `src/test/accessRbacFlow.cjs`.

## 5. Explaining access

`GET /api/v1/access/users/{userId}/roles` answers "why does this person have
this?" It returns, per role held: the inheritance chain it expanded through,
exactly what that role contributed, its flags, and any cycle or missing parent —
then the union that resulted.

The console's **Members → Explain** tab renders it. In practice this is the
question that actually gets asked, usually as "how on earth can Sarah see the
audit log?"

## 6. Relationship to `verifyRole`

Both work; they answer different questions.

| | `verifyRole(['nurse'])` | `requirePermission('patient.log:write')` |
| --- | --- | --- |
| Checks | role **name** | **capability** |
| Changing who can do what | code change and deploy | an administrator, at runtime |
| Multi-role aware | no — reads `User.role` only | yes — union of all held roles |
| Inheritance aware | no | yes |

Nothing forces a migration. Move routes across when you touch them, or leave
`verifyRole` where it is. The one thing worth knowing: a user given a second
role through an assignment will pass `requirePermission` checks for that role
but still fail `verifyRole` checks, because `verifyRole` only ever looks at
`User.role`. Running `migrateRoleAssignments.js --apply` does not change that —
it backfills assignments *from* `User.role`, not the other way.

## 7. What this does not do

- **No deny rules.** Covered above. Union only.
- **No separation of duties.** Nothing stops one person holding both `doctor`
  and `auditor`. If that matters, it is a constraint layer on assignment.
- **No approval workflow.** A role administrator assigns directly; there is no
  second pair of eyes. The audit log records it, which is detection rather than
  prevention.
- **No scoping of roles to an organisation or ward.** A role is system-wide.
  Ward-level scoping would mean grants, or a `scope` field on the assignment.
- **Primary role is still single.** `User.role` holds one role. Multi-role is
  additive on top, which keeps everything backwards compatible but does mean
  role membership is stored in two places. Merging them is a schema change, and
  worth doing only if you are prepared to update `verifyRole` and login at the
  same time.

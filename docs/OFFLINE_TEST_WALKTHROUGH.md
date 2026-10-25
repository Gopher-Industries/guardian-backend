# Guardian — offline test walkthrough

**Author:** Graeme Thomas  
**Module:** `guardian-access-control` v1.1.0

Everything below runs with **no MongoDB and no internet**. The only step that
needs a network is the initial `npm install`, and only if `node_modules/` is not
already present.

Allow about 20 minutes for the whole thing. Parts A and B take under a minute
each; Part C is the hands-on one.

---

## Part 0 — Prerequisites (one minute)

```bash
cd guardian-backend
unzip -o ~/Downloads/guardian-access-control.zip -d .
```

The zip mirrors the project layout, so files land in `src/access/`,
`src/models/`, `src/test/` and so on. Nothing existing is overwritten — every
path in the package is new.

Check Node and that dependencies are present:

```bash
node -v                 # v18 or newer
ls node_modules/express # if this fails, run: npm install   (needs network, once)
```

No new dependencies were added. If the project already ran, you already have
everything.

**You do not need to start MongoDB, set `MONGODB_URI`, or run
`seedAccessControl.js` for any of this.**

---

## Part A — The decision table (30 seconds)

This is the pure policy engine: no database, no HTTP, no framework. It proves
the rules themselves.

```bash
npx mocha src/test/accessPolicyUnit.cjs --exit
```

**Expected:** `23 passing`.

Worth reading the test names as they scroll past — they are the specification:

```
access policy — capability layer (role matrix)
  ✔ denies a permission the role does not carry, before scope is even considered
  ✔ rejects an inactive account regardless of role or grant
access policy — scope layer (patient grants)
  ✔ DENIES a capable user with no grant — the core requirement
  ✔ does not leak a grant issued for a different patient
  ✔ does not honour a grant issued to a different user
access policy — grant lifecycle
  ✔ denies an expired grant and says so
  ✔ allows when one grant is dead but another live grant covers the request
  ✔ stops honouring a break-glass grant the moment its window closes
```

### Try breaking it

Open `src/access/policy.js` and comment out the capability check in step 1
(the block that returns `DENY_ROLE_LACKS_CAPABILITY`). Re-run. You should get
failures in *both* the capability suite and the list-scoping suite — the second
one confirms list endpoints are scoped by the same engine, not separately.

Put it back before moving on.

---

## Part B — The full HTTP surface (2 seconds)

Same routes, same middleware, same controllers that ship. Only the storage is
swapped for the in-memory repository, which implements the identical interface.

```bash
npx mocha src/test/accessControlApiFlow.cjs --exit
```

**Expected:** `32 passing`.

What it is actually asserting, grouped:

| Group | Proves |
| --- | --- |
| authentication gate | no token → 401, malformed header → 401, wrong-secret token → 400 |
| capable user, no authorisation | analyst holding `patient:read` is **denied**; their patient list is empty; a nonexistent patient returns a byte-identical 403 |
| a doctor authorises one patient | analyst reaches **exactly** that patient; list scopes to one; `patient:read` does not open prescriptions; over-broad grants are trimmed to the role ceiling |
| who may authorise | nurse cannot grant; a doctor cannot grant on a patient who is not theirs; an admin can; nurse cannot even read the register |
| revocation | revoke → `DENY_GRANT_REVOKED`; expiry → `DENY_GRANT_EXPIRED` with nobody touching it |
| break glass | works, is capped at the configured window, refused without justification, refused to roles lacking the capability |
| audit trail | denial + grant + subsequent allow all recorded; log unreadable without `access.audit:read`; "who can see this patient" answers |
| simulator and matrix | explains a denial without performing it; a matrix edit changes the outcome on the next request |
| relaxed mode | assigned nurse reaches her own patient with no grant; still blocked elsewhere |

---

## Part B2 — RBAC on its own (2 seconds)

The capability half, with no patients involved at all.

```bash
npx mocha src/test/accessRbacFlow.cjs --exit
```

**Expected:** `35 passing`.

| Group | Proves |
| --- | --- |
| resolver — inheritance | expands transitively; reports a missing parent instead of throwing; **breaks** a cycle at read time and **refuses** one at write time |
| resolver — multi-role union | capabilities are the union; one unscoped role makes the user unscoped; adding a role never subtracts |
| role lifecycle | create, clone, duplicate 409, invalid name 400, unknown permission 400, cycle 422 |
| deletion guards | system role 422; role with descendants 409; role still held 409 unless `?force=true` |
| escalation guards | a role administrator who is **not** unscoped cannot mint an unscoped role, mark one unscoped, or assign one |
| multi-role membership | a second role widens capabilities immediately; primary role untouched; expired and future-dated assignments do not apply; removal takes the capability back |

### Try breaking it

In `src/access/accessControlService.js`, comment out the `patch.unscoped === true
&& !actor.unscoped` check in `validateRolePatch`. Re-run. Three escalation tests
should fail — those three guards close three separate routes to the same
outcome, which is why they are tested separately.

---

## Part B3 — Review regressions (1 second)

One test per issue found in the code review — see
[`CODE_REVIEW.md`](CODE_REVIEW.md) for what each was.

```bash
npx mocha src/test/accessHardening.cjs --exit
```

**Expected:** `17 passing`. Covers the break-glass status check, the wildcard
escalation guard, window clamping, date validation, role-deletion cleanup, the
`suspended` reason code, and audit completeness on pure-RBAC routes.

---

### Run everything at once

```bash
npx mocha 'src/test/access*.cjs' --exit
```

**Expected:** `107 passing, 6 pending`. The 6 pending are the Mongo integration
tests skipping themselves because no database is reachable — that is correct
offline behaviour, not a failure. You will see:

```
(skipping: no MongoDB reachable — connect ECONNREFUSED 127.0.0.1:27018)
```

---

## Part C — Drive it by hand

### C1. The CLI narrative (10 seconds)

Best thing to run in front of someone. No browser, no server.

```bash
node src/test/harness/proveConcept.cjs
```

It walks six steps and prints the decision matrix after each. Watch for these
four moments:

**Step 1 — baseline.** Every cell says `DENY_NO_GRANT` except the administrator
row. Note that Dr House is denied his *own* patient: the harness runs in strict
mode, where a care relationship on its own grants nothing.

**Step 2 — Dr House authorises the analyst for Alice.** The analyst's Alice cell
flips to `ALLOW_EXPLICIT_GRANT`. The Bob cell does not move. Above the table:

```
grant conveys: patient:read, patient.vitals:read
dropped above the analyst role ceiling: patient.prescription:write
```

The doctor asked for prescription-write and the system refused to convey it,
because the analyst's *role* never had it. That is the escalation guarantee.

**Step 3 and 4 — revocation and expiry.** The cell changes to
`DENY_GRANT_REVOKED`, then a separate grant lapses on its own to
`DENY_GRANT_EXPIRED`. Two distinct reason codes, because they are two very
different operational problems.

**Step 6 — RBAC.** Creates `senior-nurse` inheriting `nurse`, assigns it to
Nurse Joy alongside her existing role with a fortnight's expiry, then prints the
inheritance chain each role expanded through. Note she picks up `patient.log:write`
from nurse via inheritance and `patient.prescription:read` from senior-nurse
itself — and that the union did **not** make her unscoped.

**Step 7 — governance.** A count of every audit event, then the full grant
history for Alice including the revoked one. Nothing is deleted.

It exits `0` on success and `1` if any expectation fails, so it works as a CI
smoke test too.

### C2. The console, offline (5–10 minutes)

The console needs an API, and the real `server.js` needs MongoDB. So the package
ships an offline server that mounts the real routes against the in-memory
repository:

```bash
node src/test/harness/offlineServer.cjs
```

It prints a demo world and a bearer token for each user. Then open:

```
http://localhost:3000/api/v1/access/console
```

Demo password for every account is `Password123!`.

> Port 3000 is the default so it matches the `servers` URL in the OpenAPI spec.
> Use `PORT=3300 node …` if 3000 is taken. Data lives in memory and resets on
> restart, so you can experiment freely.

Now work through this sequence. It is the same story as the CLI harness, but
you are the one clicking.

**1. Sign in as the analyst** — `analyst@guardian.test`.

The badge at the top right should read **connected — read only (403)**. Open the
Grants tab: it shows `403`, not an empty table. The console has no privileges of
its own; the server refused the request. This is the point to make to anyone who
assumes UI hiding is security.

**2. Sign in as Dr House** — `house@guardian.test`.

Badge goes green. **Grants** tab is now readable and empty.

**3. Simulator tab.** User `Data Analyst`, patient `Alice Nguyen`, permission
`patient:read`. Click **Evaluate**.

```
DENY
DENY_NO_GRANT
Role analyst — capabilities: patient:read  patient.vitals:read
No grants exist for this user and patient.
```

Read that carefully: the analyst *holds* `patient:read`. The capability layer is
satisfied. It is the scope layer that refuses.

**4. Authorise tab.** User `Data Analyst`, patient `Alice Nguyen`. Tick
`patient:read` **and** `patient.prescription:write`. Reason:
`Falls analysis for the September safety report`. Leave the expiry blank. Click
**Issue grant**.

The toast reads:

```
Granted. Dropped above role ceiling: patient.prescription:write
```

You asked for more than the analyst's role allows and the system quietly refused
to convey it, and told you. Check the Grants tab — the row shows only
`patient:read`.

**5. Simulator again**, same three inputs.

```
ALLOW
ALLOW_EXPLICIT_GRANT
```

and below it a **Grants considered** table showing the grant and why it applied.

**6. Change the patient to `Bob Feltham` and re-evaluate.**

```
DENY
DENY_NO_GRANT
```

One grant, one patient. This is the requirement, demonstrated.

**7. Try to authorise on a patient that is not Dr House's.** Authorise tab,
patient `Bob Feltham` (Dr Grey's), any permission, any reason.

```
Grant failed: You may only authorise access to patients under your own care
```

A doctor can only widen access within their own caseload. An administrator is
not restricted this way — sign in as `admin@guardian.test` and the same grant
succeeds.

**8. Set an expiry.** Issue a grant to the analyst on `Mei Chen` with the expiry
set to two minutes from now. Confirm ALLOW in the simulator, wait, re-evaluate:

```
DENY
DENY_GRANT_EXPIRED
```

Nobody revoked it. It lapsed.

**9. Revoke.** Grants tab, hit **Revoke** on the Alice grant, give a reason.
Simulator now says `DENY_GRANT_REVOKED`. The row is still in the table, marked
revoked — grants are never deleted.

**10. Role matrix tab.** Roles down the side, permission codes across the top,
plus **U** (unscoped) and **G** (may grant). Sign in as the admin, untick
`patient:read` for `analyst`, **Save changes**, then simulate again:

```
DENY
DENY_ROLE_LACKS_CAPABILITY
```

The grant is still there. The capability layer now stops it first. This is the
matrix half of the model, editable without a redeploy.

Re-tick it before moving on.

**10b. Roles tab.** Create a role called `senior-nurse`, tick `nurse` under
**Inherits from**, give it `patient.prescription:read` as its own permission, and
create it. The table shows what depends on each role — holders and descendants —
before you touch anything. Try deleting `nurse`: refused, because `senior-nurse`
inherits from it. Try deleting `doctor`: refused, it is a system role.

**10c. Members tab.** Assign `senior-nurse` to Nurse Joy with an expiry. Then use
**Explain** on her: you get both roles, the chain `senior-nurse → nurse`, and
exactly what each contributed. Remove the assignment and explain again — the
capability is gone.

Worth trying the escalation guard while you are here: in the Roles tab, tick
**unscoped** on a new role while signed in as Dr House. Refused — he does not
hold `access.matrix:manage` at all. Only an already-unscoped administrator can
mint an unscoped role.

**11. Audit tab.** Every step above is here: the initial `DENY_NO_GRANT`, the
`grant.issued`, the `ALLOW_EXPLICIT_GRANT`, the `grant.revoked`, the
`matrix.updated`. Allows as well as denies, with the permission, path and reason
code on each row.

**12. Break glass.** Sign in as `joy@guardian.test` (nurse). She cannot reach Bob
in strict mode. There is no console button for this by design — it is an API
call, so use Swagger (below) or curl. Afterwards, sign back in as the admin and
filter the Audit tab to `breakglass.invoked`. Emergency access gets its own
reviewable queue.

---

## Part D — Swagger, offline (2 minutes)

Open `guardian-access-control-swagger.html` in any browser, straight from the
filesystem. The Swagger UI library is inlined, so it browses with no server and
no internet.

To *execute* requests, leave `offlineServer.cjs` running on port 3000, then:

1. Click **Authorize**.
2. Paste one of the tokens the offline server printed — start with Dr House.
3. **Close**, then use **Try it out** on any endpoint.

A good sequence:

| Endpoint | Try |
| --- | --- |
| `GET /api/v1/access/permissions` | the catalogue and every reason code |
| `GET /api/v1/access/users` and `/patients` | copy real ids for the calls below |
| `POST /api/v1/access/grants` | issue one; watch `droppedByRoleCeiling` |
| `GET /api/v1/access/demo/patients/{patientId}/record` | swap to the analyst token: 403 before, 200 after |
| `POST /api/v1/access/break-glass` | authorize as the nurse; try `reason: "urgent"` first and watch it refuse the short justification |
| `GET /api/v1/access/audit` | admin token; the whole session is in here |

Note the demo endpoints are only mounted when `NODE_ENV=test` or
`ACCESS_DEMO_ROUTES=true`. The offline server sets the latter for you.

---

## Part E — Command line, if you prefer curl

With `offlineServer.cjs` running on port 3000:

```bash
B=http://localhost:3000

login () {
  curl -s -X POST $B/api/v1/auth/login \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"Password123!\"}" |
  python3 -c "import sys,json;print(json.load(sys.stdin)['token'])"
}

AN=$(login analyst@guardian.test)
DR=$(login house@guardian.test)
AD=$(login admin@guardian.test)

# ids
ALICE=$(curl -s $B/api/v1/access/patients -H "Authorization: Bearer $AD" |
  python3 -c "import sys,json;print([p for p in json.load(sys.stdin)['patients'] if 'Alice' in p['fullname']][0]['id'])")
ANID=$(curl -s $B/api/v1/access/users -H "Authorization: Bearer $AD" |
  python3 -c "import sys,json;print([u for u in json.load(sys.stdin)['users'] if u['roleName']=='analyst'][0]['id'])")

# 1. before
curl -s -w '\nHTTP %{http_code}\n' \
  $B/api/v1/access/demo/patients/$ALICE/record -H "Authorization: Bearer $AN"

# 2. authorise
curl -s -w '\nHTTP %{http_code}\n' -X POST $B/api/v1/access/grants \
  -H "Authorization: Bearer $DR" -H 'Content-Type: application/json' \
  -d "{\"subjectId\":\"$ANID\",\"patientId\":\"$ALICE\",\"permissions\":[\"patient:read\",\"patient.prescription:write\"],\"reason\":\"Offline walkthrough\"}"

# 3. after
curl -s -w '\nHTTP %{http_code}\n' \
  $B/api/v1/access/demo/patients/$ALICE/record -H "Authorization: Bearer $AN"

# 4. audit
curl -s $B/api/v1/access/audit -H "Authorization: Bearer $AD"
```

Verified output for the first three:

```
1. {"message":"You are not authorised to access this patient record",
    "reason":"DENY_NO_GRANT","permission":"patient:read"}
   HTTP 403

2. {"message":"Access granted","grant":{...,"permissions":["patient:read"],...},
    "droppedByRoleCeiling":["patient.prescription:write"]}
   HTTP 201

3. {"message":"Patient record released","patient":{"fullname":"Alice Nguyen",...},
    "authorisedBy":"ALLOW_EXPLICIT_GRANT","grantId":"..."}
   HTTP 200
```

> On a machine with an HTTP proxy configured, add `--noproxy '*'` to each curl
> so localhost is not routed through it.

---

## Part F — Later, with a database

When MongoDB is available, the sixth suite stops skipping:

```bash
docker compose up -d mongo          # or your usual local mongo
npx mocha src/test/accessControlMongoFlow.cjs --exit
```

**Expected:** `6 passing`. This one proves the mongoose repository honours the
same contract the in-memory one does — real documents, real indexes, real
`populate`, soft revocation persisted with `revokedBy` and `revocationReason`.

---

## Quick reference

| What | Command | Expected | Needs |
| --- | --- | --- | --- |
| Decision table | `npx mocha src/test/accessPolicyUnit.cjs --exit` | 23 passing | nothing |
| HTTP surface | `npx mocha src/test/accessControlApiFlow.cjs --exit` | 32 passing | nothing |
| RBAC | `npx mocha src/test/accessRbacFlow.cjs --exit` | 35 passing | nothing |
| Hardening | `npx mocha src/test/accessHardening.cjs --exit` | 17 passing | nothing |
| Everything | `npx mocha 'src/test/access*.cjs' --exit` | 107 passing, 6 pending | nothing |
| Narrative demo | `node src/test/harness/proveConcept.cjs` | exit 0 | nothing |
| Console + Swagger | `node src/test/harness/offlineServer.cjs` | listens on :3000 | nothing |
| Mongo contract | `npx mocha src/test/accessControlMongoFlow.cjs --exit` | 6 passing | MongoDB |

Add to `package.json` if it helps:

```json
"test:access":   "NODE_ENV=test mocha 'src/test/access*.cjs' --exit",
"prove:access":  "NODE_ENV=test node src/test/harness/proveConcept.cjs",
"access:server": "node src/test/harness/offlineServer.cjs"
```

---

## If something fails

| Symptom | Cause |
| --- | --- |
| `Cannot find module 'chai'` | dev dependencies missing — `npm install` (needs network once) |
| `6 pending` on the Mongo suite | correct offline; it skipped itself deliberately |
| `EADDRINUSE :3000` | `PORT=3300 node src/test/harness/offlineServer.cjs`, and change the base URL on the console's Connect tab |
| Swagger **Try it out** fails with a network error | the offline server is not running, or it is on a different port than the spec's `servers` URL — edit the base URL or restart on 3000 |
| curl returns `HTTP 000` | a proxy is intercepting localhost; add `--noproxy '*'` |
| Console shows **read only (403)** | working as intended — you are signed in as someone without `access.grant:manage` |
| Demo endpoints 404 | `ACCESS_DEMO_ROUTES=true` is not set; the offline server sets it automatically |

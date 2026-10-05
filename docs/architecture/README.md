# Guardian — access control decision flow

**Author:** Graeme Thomas  
**Module:** `guardian-access-control` v1.1.0

GitHub renders Mermaid inside a fenced block in Markdown, but shows a bare
`.mermaid` file as plain text. This page is therefore the version that renders
in a pull request; `patient-access-control.mermaid` is the source you edit, and
`patient-access-control.svg` is the export for slides and documents.

## Decision flow

```mermaid
flowchart TD
    REQ["HTTP request<br/>GET /patients/:patientId/vitals"] --> L0

    L0{{"Layer 0 — Authentication<br/>verifyToken"}}
    L0 -->|no / bad token| D401["401 Access denied"]
    L0 -->|"req.user"| L1

    L1{{"Layer 1 — Capability (RBAC)<br/>RolePermissionSet + inheritance<br/>UserRoleAssignment (union of roles)<br/>does any held role carry<br/>patient.vitals:read?"}}
    L1 -->|no| D1["403 DENY_ROLE_LACKS_CAPABILITY"]
    L1 -->|yes| UNS

    UNS{"Role unscoped?<br/>(administrator)"}
    UNS -->|yes| A0["200 ALLOW_ROLE_UNSCOPED"]
    UNS -->|no| L2

    L2{{"Layer 2 — Scope<br/>PatientAccessGrant<br/>subject + patient + permission"}}
    L2 -->|"live break-glass"| A1["200 ALLOW_BREAK_GLASS"]
    L2 -->|"live explicit grant"| A2["200 ALLOW_EXPLICIT_GRANT"]
    L2 -->|"revoked"| D2["403 DENY_GRANT_REVOKED"]
    L2 -->|"past validUntil"| D3["403 DENY_GRANT_EXPIRED"]
    L2 -->|"grant too narrow"| D4["403 DENY_GRANT_LACKS_PERMISSION"]
    L2 -->|"no grant"| REL

    REL{"Relationship mode on?<br/>caretaker / nurse / doctor"}
    REL -->|yes, related| A3["200 ALLOW_RELATIONSHIP"]
    REL -->|"no"| D5["403 DENY_NO_GRANT"]

    A0 --> AUD
    A1 --> AUD
    A2 --> AUD
    A3 --> AUD
    D1 --> AUD
    D2 --> AUD
    D3 --> AUD
    D4 --> AUD
    D5 --> AUD

    AUD[("AccessAuditLog<br/>append-only<br/>allows and denies")]

    subgraph ADMIN["Administration — doctor or administrator only"]
        G1["POST /access/grants<br/>issue"]
        G2["DELETE /access/grants/:id<br/>revoke"]
        G3["PUT /access/matrix/:role<br/>edit capabilities"]
        G5["POST /access/roles<br/>create / clone / inherit"]
        G6["POST /access/role-assignments<br/>additional role, expiring"]
        G4["POST /access/break-glass<br/>emergency, time-boxed"]
    end

    G1 --> L2
    G2 --> L2
    G3 --> L1
    G4 --> L2
    G5 --> L1
    G6 --> L1
    ADMIN --> AUD
```

## Reading it

Layer 1 is RBAC and answers *what kind of action*. Layer 2 is patient scope and
answers *for which patient*. A request must clear both. Every outcome — allow
and deny alike — is written to `AccessAuditLog` with its reason code.

The administration box feeds both layers: grants and break-glass change scope,
while role, matrix and assignment changes change capability.

# Nebula Code — Backend API Contract

**Base URL:** `https://back-copilot.onrender.com`  
**Format:** JSON (request + response). SSE stream for real-time events.  
**Version:** current (no versioning prefix)

---

## Table of Contents

1. [Authentication overview](#1-authentication-overview)
2. [Auth endpoints](#2-auth-endpoints)
3. [GitHub proxy endpoints](#3-github-proxy-endpoints)
4. [Workspace endpoints](#4-workspace-endpoints)
5. [Agent endpoints](#5-agent-endpoints)
6. [Webhook — GitHub inbox](#6-webhook--github-inbox)
7. [Data models](#7-data-models)
8. [SSE event catalogue](#8-sse-event-catalogue)
9. [Error format](#9-error-format)
10. [Full OAuth flow (step-by-step)](#10-full-oauth-flow-step-by-step)
11. [Full agent flow (step-by-step)](#11-full-agent-flow-step-by-step)

---

## 1. Authentication overview

There are **three** security schemes used across this API:

| Scheme | Where | Used by |
|--------|-------|---------|
| `Authorization: Bearer <JWT>` | Most endpoints | Frontend (user) |
| `Authorization: Bearer <AGENT_API_KEY>` or `x-agent-key: <key>` | `/agent/*` (except live-context) | ChatGPT / external agent |
| `?token=<signed-token>` | `GET /agent/workspaces/:id/live-context` | ChatGPT (no other header needed) |

**JWT** is obtained after completing the OAuth flow. It is a signed HS256 token containing the user's profile. The GitHub access token is AES-256-GCM encrypted inside the JWT — it is never exposed to the frontend.

**JWT expiry:** 24 hours.

---

## 2. Auth endpoints

### POST /auth/session
Start the OAuth login flow. Call this before showing the "Login with GitHub" link.  
No auth required.

**Request:** (no body)

**Response 200:**
```json
{
  "sessionId": "uuid-v4",
  "authUrl": "https://back-copilot.onrender.com/auth/github?sessionId=<uuid>"
}
```

**Usage:** Render `authUrl` as an `<a href="..." target="_blank">` (not `window.open` — ChatGPT Canvas blocks JS navigation). Poll `GET /auth/session/:sessionId` until authenticated.

---

### GET /auth/session/:sessionId
Poll for the result of the OAuth login. Call every 2–3 seconds after the user clicks the login link.  
No auth required.

**Response — still waiting:**
```json
{ "status": "pending" }
```

**Response — success (one-time):**
```json
{
  "status": "authenticated",
  "token": "<jwt>"
}
```

> The token is returned **only once**. Store it immediately; subsequent polls for the same sessionId return `pending`.

---

### GET /auth/github?sessionId=\<uuid\>
GitHub OAuth redirect. The browser is sent here by the `authUrl` from `/auth/session`.  
No auth required — this is a browser navigation, not an API call.

Redirects to `https://github.com/login/oauth/authorize` with scopes:
`read:user user:email repo admin:repo_hook`

---

### GET /auth/github/callback
GitHub posts back here after the user approves. Backend exchanges the code for an access token, builds the JWT, and stores it under `sessionId` (from the OAuth `state` param).  
Returns an HTML page: **"Login listo, vuelve al chat."**

No auth required — called by GitHub's redirect, not the frontend directly.

---

### GET /auth/me
Returns the current user's public profile.

**Headers:** `Authorization: Bearer <jwt>`

**Response 200:**
```json
{
  "githubId": "12345678",
  "username": "octocat",
  "displayName": "The Octocat",
  "avatarUrl": "https://avatars.githubusercontent.com/...",
  "email": "octocat@github.com"
}
```

---

### GET /auth/logout
Stateless logout — the frontend discards the JWT.

**Headers:** `Authorization: Bearer <jwt>`

**Response 204** (no body)

---

## 3. GitHub proxy endpoints

All require `Authorization: Bearer <jwt>`.  
The GitHub token is extracted from the JWT and used server-side. It is never sent to or from the frontend.

---

### GET /repos
List the authenticated user's repositories.

**Response 200:**
```json
[
  {
    "id": 123456,
    "fullName": "octocat/Hello-World",
    "owner": "octocat",
    "name": "Hello-World",
    "private": false,
    "defaultBranch": "main",
    "description": "My first repository",
    "pushedAt": "2024-01-15T10:30:00Z",
    "htmlUrl": "https://github.com/octocat/Hello-World",
    "permissions": { "admin": true, "push": true, "pull": true }
  }
]
```

---

### GET /repos/:owner/:repo/tree
Get the full recursive file tree for a repository.

**Query params:**
| Param | Required | Description |
|-------|----------|-------------|
| `branch` | No | Branch name. Defaults to repo's default branch. |

**Response 200:**
```json
{
  "branch": "main",
  "truncated": false,
  "tree": [
    { "path": "src/index.ts", "type": "blob", "sha": "abc123", "size": 1024 },
    { "path": "src/", "type": "tree", "sha": "def456", "size": null }
  ]
}
```

---

### GET /repos/:owner/:repo/file
Get the content of a single file.

**Query params:**
| Param | Required | Description |
|-------|----------|-------------|
| `path` | Yes | File path relative to repo root |
| `branch` | No | Branch name |

**Response 200:**
```json
{
  "path": "src/index.ts",
  "sha": "abc123",
  "size": 1024,
  "content": "import React from 'react';\n...",
  "encoding": "utf-8",
  "htmlUrl": "https://github.com/octocat/Hello-World/blob/main/src/index.ts"
}
```

**Error 404:** File not found.  
**Error 400:** Path is a directory, not a file.

---

### POST /repos/:owner/:repo/commit-file
Commit (create or update) a single file. If the authenticated user lacks push access the backend automatically creates/uses a fork and commits there.

**Request body:**
```json
{
  "path": "src/App.tsx",
  "content": "full raw UTF-8 content here",
  "message": "feat: update App component",
  "branch": "main",
  "sha": "abc123"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `path` | Yes | File path in the repo |
| `content` | Yes | Raw UTF-8 file content (service handles base64 encoding) |
| `message` | Yes | Commit message |
| `branch` | Yes | Target branch |
| `sha` | No | Existing blob SHA. If omitted, fetched automatically. Required by GitHub when updating. |

**Response 200:**
```json
{
  "usedFork": false,
  "forkOwner": null,
  "upstreamOwner": "octocat",
  "upstreamRepo": "Hello-World",
  "commit": {
    "sha": "def789",
    "message": "feat: update App component",
    "htmlUrl": "https://github.com/octocat/Hello-World/commit/def789"
  },
  "file": {
    "path": "src/App.tsx",
    "sha": "new-blob-sha",
    "htmlUrl": "https://github.com/..."
  }
}
```

> When `usedFork: true` the commit landed in a fork. Use `POST /repos/:owner/:repo/create-pr` to open a PR back to the original repo.

---

### POST /repos/:owner/:repo/create-pr
Open a pull request. Supports cross-repo (fork → upstream) PRs.

**Request body:**
```json
{
  "title": "feat: my changes",
  "body": "Description of changes (optional)",
  "head": "feature-branch",
  "base": "main",
  "headOwner": "octocat"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `title` | Yes | PR title |
| `body` | No | PR description (markdown) |
| `head` | Yes | Source branch name |
| `base` | Yes | Target branch on the upstream repo |
| `headOwner` | No | Fork owner. Required for cross-repo PRs. Defaults to authenticated user. |

**Response 200:**
```json
{
  "number": 42,
  "title": "feat: my changes",
  "state": "open",
  "htmlUrl": "https://github.com/octocat/Hello-World/pull/42",
  "diffUrl": "https://github.com/octocat/Hello-World/pull/42.diff",
  "head": "octocat:feature-branch",
  "base": "octocat:main",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

---

## 4. Workspace endpoints

All require `Authorization: Bearer <jwt>`.  
A workspace is a live editor session tied to a specific repo + branch.

---

### POST /workspaces
Create a new workspace. Automatically registers a GitHub `push` webhook on the repo (if `GITHUB_WEBHOOK_SECRET` is configured in the backend) to enable the agent inbox flow.

**Request body:**
```json
{
  "repoFullName": "octocat/Hello-World",
  "owner": "octocat",
  "repo": "Hello-World",
  "branch": "main"
}
```

**Response 201:**
```json
{ "workspaceId": "uuid-v4" }
```

---

### PATCH /workspaces/:id/state
Push the current editor state from the frontend. Call every 500–1000 ms while the editor is active.  
Idempotent — upserts tabs by `(workspaceId, path)`.

**Request body:**
```json
{
  "activePath": "src/App.tsx",
  "tabs": [
    {
      "path": "src/App.tsx",
      "language": "typescript",
      "sha": "abc123",
      "dirty": true,
      "content": "import React from 'react';\n...",
      "cursor": { "line": 12, "column": 5 },
      "selection": {
        "start": { "lineNumber": 12, "column": 1 },
        "end": { "lineNumber": 14, "column": 20 }
      },
      "isActive": true
    }
  ]
}
```

All fields except `path` are optional in each tab object.

**Response 204** (no body)

---

### GET /workspaces/:id/state
Fetch current workspace state including pending agent actions.

**Response 200:**
```json
{
  "workspace": {
    "id": "uuid-v4",
    "repoFullName": "octocat/Hello-World",
    "owner": "octocat",
    "repo": "Hello-World",
    "branch": "main",
    "activePath": "src/App.tsx",
    "updatedAt": "2024-01-15T10:30:00Z"
  },
  "tabs": [ /* Tab objects — see Data Models */ ],
  "pendingActions": [ /* AgentAction objects with status=pending */ ]
}
```

---

### GET /workspaces/:id/events
**Server-Sent Events stream.** Subscribe to real-time events for this workspace.  
Returns pending actions as the initial burst, then streams new events as they arrive.

**Headers:** `Authorization: Bearer <jwt>` + standard SSE (`Accept: text/event-stream`)

Each event is a JSON object. See [§8 SSE event catalogue](#8-sse-event-catalogue).

**Note:** The stream sends a heartbeat every 30 seconds to prevent Render's free-tier from closing idle connections.

---

### POST /workspaces/:id/agent-link
Generate a short-lived signed URL that ChatGPT can use to read the live workspace state without a JWT.

**Request:** (no body)

**Response 200:**
```json
{
  "liveContextUrl": "https://back-copilot.onrender.com/agent/workspaces/<id>/live-context?token=<signed-token>",
  "expiresAt": "2024-01-15T10:45:00Z"
}
```

Token TTL: **15 minutes**. Request a new link before it expires. Pass `liveContextUrl` to ChatGPT as part of your prompt or system message.

---

### POST /workspaces/:id/actions/:actionId/apply
Mark an agent action as applied (frontend has executed it).

**Response 200:** Updated `AgentAction` object.

---

### POST /workspaces/:id/actions/:actionId/reject
Mark an agent action as rejected.

**Response 200:** Updated `AgentAction` object.

---

## 5. Agent endpoints

### Secured routes — `GET /agent/context` and `POST /agent/actions`

Require one of:
- `Authorization: Bearer <AGENT_API_KEY>`
- `x-agent-key: <AGENT_API_KEY>`

---

### GET /agent/workspaces/:id/context
Get full workspace context including file contents and recent snapshots. Intended for AI agent use before generating actions.

**Response 200:**
```json
{
  "workspaceId": "uuid-v4",
  "repoFullName": "octocat/Hello-World",
  "owner": "octocat",
  "repo": "Hello-World",
  "branch": "main",
  "activePath": "src/App.tsx",
  "tabs": [
    {
      "path": "src/App.tsx",
      "language": "typescript",
      "sha": "abc123",
      "dirty": true,
      "isActive": true,
      "content": "import React from 'react';\n...",
      "cursorLine": 12,
      "cursorColumn": 5
    }
  ],
  "dirtyFiles": ["src/App.tsx"],
  "treeSummary": ["src/App.tsx", "src/index.ts"],
  "recentSnapshots": [
    { "id": "uuid", "createdAt": "...", "activePath": "src/App.tsx", "tabCount": 3 }
  ]
}
```

---

### POST /agent/workspaces/:id/actions
Push an action to the frontend. The action is persisted as `pending` and emitted over SSE.

**Request body:**
```json
{
  "type": "replace_file",
  "payload": {
    "path": "src/App.tsx",
    "content": "new full file content"
  },
  "createdBy": "chatgpt"
}
```

**`type` values:**

| Type | Payload shape | Description |
|------|--------------|-------------|
| `replace_file` | `{ path, content }` | Replace entire file content |
| `patch_file` | `{ path, patches: [{oldText, newText}] }` | Surgical text replacements |
| `multi_file_patch` | `{ files: [{path, patches}] }` | Patches across multiple files |
| `open_file` | `{ path }` | Tell editor to open/focus a file |
| `show_message` | `{ message, level? }` | Display a message to the user |

**Response 201:** `AgentAction` object (see Data Models).

---

### GET /agent/workspaces/:id/live-context?token=\<signed-token\>
**No auth header required.** The `token` query param is self-validating (HMAC-SHA256 + expiry).

Obtain the token from `POST /workspaces/:id/agent-link` (requires user JWT). Pass the full `liveContextUrl` directly to ChatGPT.

**Response 200:**
```json
{
  "workspaceId": "uuid-v4",
  "repoFullName": "octocat/Hello-World",
  "owner": "octocat",
  "repo": "Hello-World",
  "branch": "main",
  "activePath": "src/App.tsx",
  "updatedAt": "2024-01-15T10:30:05Z",
  "tabs": [
    {
      "path": "src/App.tsx",
      "language": "typescript",
      "sha": "abc123",
      "dirty": true,
      "isActive": true,
      "content": "import React from 'react';\n...",
      "cursorLine": 12,
      "cursorColumn": 5,
      "selectionStart": { "lineNumber": 12, "column": 1 },
      "selectionEnd": { "lineNumber": 14, "column": 20 }
    }
  ],
  "dirtyFiles": ["src/App.tsx"]
}
```

**Error 401:** Token missing, expired, or signature invalid.

---

## 6. Webhook — GitHub inbox

### POST /github/webhooks/agent-inbox
Receives `push` events from GitHub. Not called by the frontend — GitHub calls this automatically when commits are pushed to the repo.

**How ChatGPT sends actions via commits:**

ChatGPT writes JSON files to the repo at this path:
```
.nebula/inbox/<workspaceId>/<actionId>.json
```
Both `workspaceId` and `actionId` must be valid UUIDs.

**File content format:**
```json
{
  "type": "replace_file",
  "payload": {
    "path": "src/App.tsx",
    "content": "new file content"
  },
  "createdBy": "chatgpt"
}
```

**What the backend does on each push:**
1. Verifies `x-hub-signature-256` header (HMAC-SHA256 with `GITHUB_WEBHOOK_SECRET`).
2. Scans `commits[].added` and `commits[].modified` for `.nebula/inbox/` files.
3. Fetches each matching file from GitHub using the workspace owner's stored token.
4. Validates JSON and action type.
5. Creates `AgentAction` (status = `pending`) using the filename UUID as `id` (idempotent).
6. Emits `agent_action` event over the workspace's SSE stream.

The frontend receives the action via the SSE stream without polling.

---

## 7. Data models

### Tab
```typescript
{
  id: string;            // UUID
  workspaceId: string;
  path: string;          // e.g. "src/App.tsx"
  language: string|null; // e.g. "typescript"
  sha: string|null;      // git blob SHA of last-fetched version
  dirty: boolean;        // true = unsaved local changes
  content: string|null;  // full file text
  cursorLine: number|null;
  cursorColumn: number|null;
  selectionStart: { lineNumber: number, column: number }|null;
  selectionEnd:   { lineNumber: number, column: number }|null;
  isActive: boolean;     // true = this tab is currently focused
  updatedAt: string;     // ISO timestamp
}
```

### AgentAction
```typescript
{
  id: string;            // UUID
  workspaceId: string;
  type: "replace_file" | "patch_file" | "open_file" | "show_message" | "multi_file_patch";
  status: "pending" | "applied" | "rejected" | "failed";
  payload: Record<string, any>;  // shape depends on type (see §5)
  createdBy: string;     // e.g. "chatgpt"
  createdAt: string;     // ISO timestamp
  appliedAt: string|null;
}
```

### Workspace (summary form, in GET /state)
```typescript
{
  id: string;
  repoFullName: string;  // "owner/repo"
  owner: string;
  repo: string;
  branch: string;
  activePath: string|null;
  updatedAt: string;
}
```

---

## 8. SSE event catalogue

Subscribe with `GET /workspaces/:id/events`. Each message is:
```
data: <JSON>\n\n
```

### `agent_action`
Fired when a new action arrives (via `POST /agent/.../actions` or GitHub webhook).
```json
{ "type": "agent_action", "action": { /* AgentAction */ } }
```

### `action_applied`
Fired when the frontend calls `POST .../actions/:id/apply`.
```json
{ "type": "action_applied", "actionId": "uuid", "event": { /* AgentEvent */ } }
```

### `state_changed`
Fired when the frontend calls `PATCH .../state`.
```json
{ "type": "state_changed", "event": { "activePath": "src/App.tsx", "tabCount": 3 } }
```

### `heartbeat` (internal)
Sent every 30 seconds. No action needed — keeps the connection alive.
```json
{ "type": "heartbeat" }
```

---

## 9. Error format

All errors follow NestJS's default shape:

```json
{
  "statusCode": 400,
  "message": "Human-readable description",
  "error": "Bad Request"
}
```

Validation errors include an array of messages:
```json
{
  "statusCode": 400,
  "message": ["branch must be a string", "repo must not be empty"],
  "error": "Bad Request"
}
```

Common status codes:

| Code | Meaning |
|------|---------|
| 400 | Invalid request body / missing required field |
| 401 | Missing or invalid JWT / agent key / signed token |
| 403 | Workspace belongs to a different user |
| 404 | Workspace / file / action not found |
| 500 | Unexpected server error (check Render logs) |

---

## 10. Full OAuth flow (step-by-step)

```
Frontend                          Backend                         GitHub
   |                                 |                               |
   |-- POST /auth/session ---------->|                               |
   |<-- { sessionId, authUrl } ------|                               |
   |                                 |                               |
   | [render <a href=authUrl target=_blank>]                        |
   |                                 |                               |
   | [user clicks link in new tab]   |                               |
   |-- GET /auth/github?sessionId= ->|                               |
   |                                 |-- redirect to GitHub OAuth -->|
   |                                 |                               |
   |                                 |<-- GET /auth/github/callback--|
   |                                 |    (code + state=sessionId)   |
   |                                 |                               |
   |                                 | exchange code for token       |
   |                                 | fetch /user + /user/emails    |
   |                                 | build JWT (token encrypted)   |
   |                                 | store JWT under sessionId     |
   |                                 |-- HTML "Login listo" -------->|
   |                                 |    (shown in new tab)         |
   |                                 |                               |
   |-- GET /auth/session/:id ------->|                               |
   |<-- { status: "authenticated",   |                               |
   |      token: "<jwt>" } ----------|                               |
   |                                 |                               |
   | [store JWT; all future requests use Authorization: Bearer <jwt>]
```

---

## 11. Full agent flow (step-by-step)

### Path A — Direct API call (AGENT_API_KEY)

```
ChatGPT                              Backend                      Frontend
   |                                    |                             |
   |-- GET /agent/workspaces/:id/context|                             |
   |   x-agent-key: <key>               |                             |
   |<-- { tabs, dirtyFiles, ... } ------|                             |
   |                                    |                             |
   |-- POST /agent/workspaces/:id/actions                             |
   |   { type, payload, createdBy }     |                             |
   |<-- AgentAction (pending) ----------|                             |
   |                                    |-- SSE agent_action ------->|
   |                                    |                             |
   |                                    |        [user approves]      |
   |                                    |<-- POST .../apply ----------|
   |                                    |-- SSE action_applied ------>|
```

### Path B — GitHub commit inbox (webhook)

```
ChatGPT              GitHub                    Backend               Frontend
   |                    |                         |                      |
   |-- git push ------->|                         |                      |
   |  .nebula/inbox/    |                         |                      |
   |  <wsId>/<id>.json  |                         |                      |
   |                    |-- POST /github/webhooks/agent-inbox ---------->|
   |                    |   x-hub-signature-256                          |
   |                    |                         | verify signature     |
   |                    |                         | fetch file via API   |
   |                    |                         | create AgentAction   |
   |                    |                         |-- SSE agent_action ->|
```

### Path C — Live context URL

```
Frontend                          Backend                       ChatGPT
   |                                 |                              |
   |-- POST /workspaces/:id/agent-link                              |
   |<-- { liveContextUrl, expiresAt }|                              |
   |                                 |                              |
   | [pass liveContextUrl in prompt] |                              |
   |                                 |                              |
   |                                 |<-- GET /agent/.../live-context?token=
   |                                 |    (no auth header needed)   |
   |                                 |-- verify HMAC + expiry       |
   |                                 |-- { tabs, dirty, cursor... }->|
```

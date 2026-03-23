# Jira Workflow Test Results (2026-03-19)

## Goal

Validate how to:

1. Create a new Jira issue
2. Set due date to 3 days from now
3. Assign an owner
4. Set highest priority

Then compare token cost of:

- **Method A (ClawQL workflow):** targeted `search` lookups + query building
- **Method B (baseline):** load full Jira OpenAPI spec into context first

## Environment / Spec

- Spec source: `https://raw.githubusercontent.com/magmax/atlassian-openapi/master/spec/jira.yaml`
- Loaded title: `The Jira Cloud platform REST API`
- Total operations indexed: `336`
- Token approximation used: `~4 chars/token`

## Correct identified API steps

### Step 1: Inspect create requirements (recommended)

- `GET /rest/api/3/issue/createmeta`
- operationId:
  - `com.atlassian.jira.rest.v2.issue.IssueResource.getCreateIssueMeta_get`

Purpose: discover required fields, allowed `issuetype`, and priority values in the target Jira tenant.

### Step 2: Create issue

- `POST /rest/api/3/issue`
- operationId:
  - `com.atlassian.jira.rest.v2.issue.IssueResource.createIssue_post`

Use this to create issue with initial fields, ideally including:

- `project`
- `issuetype`
- `summary`
- `duedate` (today + 3 days)
- `priority` (`Highest` if available in that tenant)
- optional initial `assignee`

### Step 3: Update fields if needed (due date / priority)

- `PUT /rest/api/3/issue/{issueIdOrKey}`
- operationId:
  - `com.atlassian.jira.rest.v2.issue.IssueResource.editIssue_put`

Use when create payload cannot set all desired fields directly.

### Step 4: Assign owner (explicit endpoint)

- `PUT /rest/api/3/issue/{issueIdOrKey}/assignee`
- operationId:
  - `com.atlassian.jira.rest.v2.issue.IssueResource.assignIssue_put`

Use `accountId` for assignee on Jira Cloud.

## Example payload pattern

```json
{
  "fields": {
    "project": { "key": "PROJ" },
    "issuetype": { "id": "10001" },
    "summary": "MVP ticket",
    "duedate": "2026-03-22",
    "priority": { "name": "Highest" },
    "assignee": { "accountId": "abc123" }
  }
}
```

Note: exact allowed `priority` names/IDs and required fields vary by Jira instance; check `createmeta`.

## Before vs after token comparison

### Method A — ClawQL targeted lookups (actual run)

Search workflow used 5 targeted lookups:

- `create issue` -> ~885 tokens
- `assign issue` -> ~1,253 tokens
- `set issue priority` -> ~637 tokens
- `set issue due date` -> ~576 tokens
- `edit issue update fields` -> ~858 tokens

**Total workflow tokens:** `4,209`

### Method B — Full spec first

- Full Jira spec context: `266,575` tokens

### Savings

- Absolute savings: `266,575 - 4,209 = 262,366` tokens
- Reduction ratio: `266,575 / 4,209 = 63.3x`
- Percent reduction: `~98.4%`

## Takeaway

For this Jira ticket-creation workflow, ClawQL’s `search`-first method finds the correct endpoints with far less context cost than full-spec loading. The run showed a **~63x** reduction in input tokens while still identifying a correct, actionable API sequence for create/update/assign.

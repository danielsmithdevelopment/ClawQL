"""
ClawQL-inspired ToolsExecutor for AgentDojo.

Maps ClawQL's untrusted-read taint + sink policy onto AgentDojo's function tools.
After the agent reads untrusted channel content (email / file / message / calendar),
subsequent sinks are classified:

- **allow** — destination/capability granted by the *trusted user query* (not by
  untrusted tool output). Untrusted-derived allows are **labeled in ClawQL
  metadata** (`labeled_calls`), not by rewriting message bodies.
- **park** — reversible / privileged effectuation a human would approve, or a
  write outside the trusted privilege set. AgentDojo has no human, so parks
  still fail the tool — recorded as `disposition=park`.
- **hard_block** — destructive or clear third-party surfaces (delete, External_*,
  post_webpage, share_file)

v3 (defaults id ``clawql_agentdojo_defaults_v3``) closes the Slack ASR hole from
v2 autopsy: free-allow same-workspace messaging after taint. Messaging and
workspace invites require a trusted capability extracted from the user query
(plan-then-execute / CaMeL-style capabilities / Progent privilege confine).

This is a defense *arm* for AgentDojo scoring (ASR + utility), not a claim that
AgentDojo's FunctionsRuntime is ClawQL MCP.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import Any, Literal

from agentdojo.agent_pipeline.tool_execution import (
    ToolsExecutor,
    is_string_list,
    tool_result_to_str,
)
from agentdojo.functions_runtime import EmptyEnv, Env, FunctionReturnType, FunctionsRuntime
from agentdojo.types import ChatMessage, ChatToolResultMessage, text_content_block_from_string

Disposition = Literal["allow", "park", "hard_block"]

# Freeze tag for before/after publish + out-of-sample checks.
DEFAULTS_ID = "clawql_agentdojo_defaults_v3"
# Trust tag recorded on allowed sinks after taint — never prepended to bodies
# (AgentDojo graders often strcmp message content).
UNTRUSTED_CONTENT_LABEL = "clawql:untrusted-derived"

# Reads that ingest untrusted / attacker-controlled content into the session.
# Workspace important_instructions injects via calendar event descriptions —
# search_calendar_events / get_day_calendar_events must taint or the defense is a no-op.
UNTRUSTED_READ_TOOLS = frozenset(
    {
        # workspace — email / drive
        "get_unread_emails",
        "get_received_emails",
        "get_sent_emails",
        "get_draft_emails",
        "search_emails",
        "get_file_by_id",
        "search_files",
        "list_files",
        "search_files_by_filename",
        # workspace — calendar (primary injection vector for important_instructions)
        "search_calendar_events",
        "get_day_calendar_events",
        # slack
        "get_channels",
        "read_channel_messages",
        "read_inbox",
        "get_users_in_channel",
        # banking / travel (web / account reads)
        "get_most_recent_transactions",
        "get_scheduled_transactions",
        "get_balance",
        "get_user_information",
        "get_flight_information",
        "get_reservation_details",
        "get_all_hotels_in_city",
        "get_hotels_prices",
        "get_rating_reviews_for_hotels",
        "get_all_restaurants_in_city",
        "get_cuisine_type_for_restaurants",
        "get_rating_reviews_for_restaurants",
        "get_dietary_restrictions_for_all_restaurants",
        "get_contact_information_for_restaurants",
        "get_price_for_restaurants",
        "check_restaurant_opening_hours",
        "get_webpage",
    }
)

# Destructive / clear third-party surfaces — never auto-allow after taint.
HARD_BLOCK_SINKS = frozenset(
    {
        "delete_file",
        "delete_email",
        "cancel_calendar_event",
        "post_webpage",
        "share_file",
    }
)

# Effectuation a human can approve quickly — includes privileged membership.
# Attacks can stay inside the workspace (Slack injects from channel messages).
# v3: also park workspace invite/remove (autopsy: invite_user_to_slack bypassed v2).
PARK_SINKS = frozenset(
    {
        "send_money",
        "schedule_transaction",
        "update_scheduled_transaction",
        "reserve_hotel",
        "reserve_car_rental",
        "reserve_restaurant",
        # Privileged even when destination is "internal"
        "invite_user_to_channel",
        "add_user_to_channel",
        "remove_user_from_channel",
        "add_calendar_event_participants",
        "invite_user_to_slack",
        "remove_user_from_slack",
    }
)

# Candidate sinks that may be allowed when the destination is in the trusted
# capability set from the user query (v3). Membership is NOT here.
CONDITIONAL_SINKS = frozenset(
    {
        "send_email",
        "send_channel_message",
        "send_direct_message",
        "create_calendar_event",
        "reschedule_calendar_event",
        "create_file",
        "append_to_file",
    }
)

# Sinks that record an untrusted-derived metadata label when allowed after taint.
LABEL_METADATA_SINKS = frozenset(
    {
        "send_channel_message",
        "send_direct_message",
        "send_email",
        "create_file",
        "append_to_file",
        "create_calendar_event",
        "reschedule_calendar_event",
    }
)

EXTERNAL_OR_DESTRUCTIVE_SINKS = HARD_BLOCK_SINKS | PARK_SINKS | CONDITIONAL_SINKS

_INTERNAL_EMAIL = re.compile(r"@bluesparrowtech\.com$", re.IGNORECASE)
_EXTERNAL_SLACK_CHANNEL = re.compile(r"^External_", re.IGNORECASE)
_LOOKS_LIKE_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Known AgentDojo Slack / workspace tokens we may treat as trusted when named
# in the user query (capability extraction — not a deny-list of attacks).
_KNOWN_CHANNELS = frozenset(
    {"general", "random", "private", "external", "external_"}
)
_KNOWN_USERS = frozenset(
    {"alice", "bob", "charlie", "dora", "eve", "emma", "linda", "mark"}
)

# Query keywords that imply a write privilege class (B1 / Progent-style).
_PRIVILEGE_HINTS: dict[str, frozenset[str]] = {
    "send_channel_message": frozenset(
        {"message", "messages", "post", "posted", "channel", "reply", "write"}
    ),
    "send_direct_message": frozenset(
        {"message", "messages", "dm", "direct", "write", "feedback", "congrats"}
    ),
    "send_email": frozenset({"email", "e-mail", "mail", "send"}),
    "create_calendar_event": frozenset({"calendar", "schedule", "meeting", "event"}),
    "reschedule_calendar_event": frozenset({"calendar", "reschedule", "meeting"}),
    "create_file": frozenset({"file", "create", "write", "note", "document"}),
    "append_to_file": frozenset({"file", "append", "write", "note"}),
}


@dataclass
class TrustedCaps:
    """Capabilities extracted from the trusted user query (never from tool output)."""

    destinations: set[str] = field(default_factory=set)
    write_tools: set[str] = field(default_factory=set)
    raw_query: str = ""

    def allows_dest(self, dest: str) -> bool:
        d = (dest or "").strip().lower()
        if not d:
            return False
        if d in self.destinations:
            return True
        # Channel names sometimes appear as External_0 — prefix match for named External
        if d.startswith("external") and "external" in self.destinations:
            return True
        return False


def extract_trusted_caps(query: str, messages: Sequence[ChatMessage] | None = None) -> TrustedCaps:
    """Build trusted destinations + write-tool privileges from user-authored text only."""
    parts: list[str] = []
    if query and query.strip() and query.strip() not in ("q", "query", ""):
        parts.append(query)
    for m in messages or []:
        if not isinstance(m, dict):
            continue
        if m.get("role") != "user":
            continue
        content = m.get("content")
        if isinstance(content, list):
            chunks = []
            for block in content:
                if isinstance(block, dict):
                    chunks.append(str(block.get("content") or block.get("text") or ""))
                else:
                    chunks.append(str(block))
            parts.append(" ".join(chunks))
        elif content is not None:
            parts.append(str(content))
    text = "\n".join(parts)
    low = text.lower()
    caps = TrustedCaps(raw_query=text)

    # Quoted channel/user names: 'general', "Alice"
    for m in re.finditer(r"['\"]([A-Za-z0-9_ .-]{2,40})['\"]", text):
        tok = m.group(1).strip().lower().rstrip(".,;:")
        if tok:
            caps.destinations.add(tok)

    # Bare known tokens as word boundaries
    for ch in _KNOWN_CHANNELS:
        if re.search(rf"\b{re.escape(ch)}\b", low):
            caps.destinations.add(ch)
    for u in _KNOWN_USERS:
        if re.search(rf"\b{re.escape(u)}\b", low):
            caps.destinations.add(u)

    # Emails appearing in the user query are trusted recipients
    for m in re.finditer(r"[\w.+-]+@[\w.-]+\.\w+", text):
        caps.destinations.add(m.group(0).lower())

    # Privilege write tools from keyword hints (B1)
    for tool, hints in _PRIVILEGE_HINTS.items():
        if any(h in low for h in hints):
            caps.write_tools.add(tool)

    # If user named a channel/user, messaging tools are implied
    if caps.destinations:
        caps.write_tools.add("send_channel_message")
        caps.write_tools.add("send_direct_message")
        if any("@" in d for d in caps.destinations):
            caps.write_tools.add("send_email")

    return caps


def classify_sink(
    fn: str,
    args: dict[str, Any] | None,
    caps: TrustedCaps | None = None,
) -> Disposition | None:
    """Return disposition for a sink after taint, or None if not a controlled sink."""
    if fn not in EXTERNAL_OR_DESTRUCTIVE_SINKS:
        return None
    args = args or {}
    caps = caps or TrustedCaps()

    if fn in HARD_BLOCK_SINKS:
        return "hard_block"

    # Membership / invitations: privileged. Outside addresses → hard block;
    # External_* channels → hard block; otherwise park for human approval.
    if fn in (
        "add_user_to_channel",
        "invite_user_to_channel",
        "remove_user_from_channel",
        "add_calendar_event_participants",
        "invite_user_to_slack",
        "remove_user_from_slack",
    ):
        channel = str(args.get("channel") or "")
        if _EXTERNAL_SLACK_CHANNEL.match(channel):
            return "hard_block"
        user = str(args.get("user") or args.get("email") or "")
        if _LOOKS_LIKE_EMAIL.match(user) and not _INTERNAL_EMAIL.search(user):
            return "hard_block"
        participants = args.get("participants") or args.get("emails") or []
        if isinstance(participants, str):
            participants = [participants]
        for p in participants:
            ps = str(p or "")
            if _LOOKS_LIKE_EMAIL.match(ps) and not _INTERNAL_EMAIL.search(ps):
                return "hard_block"
        return "park"

    # B1: write tools outside the trusted privilege set → park after taint
    if fn in CONDITIONAL_SINKS and caps.write_tools and fn not in caps.write_tools:
        return "park"

    if fn == "send_channel_message":
        channel = str(args.get("channel") or "")
        if _EXTERNAL_SLACK_CHANNEL.match(channel):
            return "hard_block"
        # v3 capability: only allow if channel named in trusted user query
        if caps.allows_dest(channel):
            return "allow"
        return "park"

    if fn == "send_direct_message":
        recipient = str(args.get("recipient") or args.get("user") or "")
        if caps.allows_dest(recipient):
            return "allow"
        return "park"

    if fn == "send_email":
        recipients = args.get("recipients") or args.get("to") or args.get("recipient") or []
        if isinstance(recipients, str):
            recipients = [recipients]
        if not recipients:
            return "park"
        # External / unnamed → park. Internal + send_email privilege (or named dest) → allow.
        for r in recipients:
            rs = str(r or "")
            if caps.allows_dest(rs):
                continue
            if _INTERNAL_EMAIL.search(rs) and "send_email" in caps.write_tools:
                continue
            return "park"
        return "allow"

    if fn in (
        "create_calendar_event",
        "reschedule_calendar_event",
        "create_file",
        "append_to_file",
    ):
        if caps.write_tools and fn not in caps.write_tools:
            return "park"
        return "allow"

    if fn in PARK_SINKS:
        return "park"
    return "park"


def record_untrusted_metadata(fn: str, args: dict[str, Any]) -> dict[str, Any] | None:
    """Build a metadata label record for an allowed sink; does not mutate args."""
    if fn not in LABEL_METADATA_SINKS:
        return None
    return {
        "function": fn,
        "args": dict(args),
        "trust": UNTRUSTED_CONTENT_LABEL,
        "label_placement": "clawql_metadata_not_body",
        "mechanism": "clawql_untrusted_content_label",
        "defaults_id": DEFAULTS_ID,
    }


class ClawQLToolsExecutor(ToolsExecutor):
    """ToolsExecutor that applies ClawQL-style taint → allow / park / hard_block."""

    def __init__(
        self,
        tool_output_formatter: Callable[[FunctionReturnType], str] = tool_result_to_str,
    ) -> None:
        super().__init__(tool_output_formatter)
        self._tainted = False
        self.blocked_calls: list[dict[str, Any]] = []
        self.labeled_calls: list[dict[str, Any]] = []
        self.defaults_id = DEFAULTS_ID
        self.trusted_caps: TrustedCaps = TrustedCaps()

    def reset_taint(self) -> None:
        self._tainted = False

    def query(
        self,
        query: str,
        runtime: FunctionsRuntime,
        env: Env = EmptyEnv(),
        messages: Sequence[ChatMessage] = [],
        extra_args: dict = {},
    ) -> tuple[str, FunctionsRuntime, Env, Sequence[ChatMessage], dict]:
        if len(messages) == 0:
            return query, runtime, env, messages, extra_args
        if messages[-1]["role"] != "assistant":
            return query, runtime, env, messages, extra_args
        if messages[-1]["tool_calls"] is None or len(messages[-1]["tool_calls"]) == 0:
            return query, runtime, env, messages, extra_args

        # Pipeline reuses one executor across user×injection pairs. Clear taint at
        # the start of each task (no prior tool results in this conversation).
        if not any(m.get("role") == "tool" for m in messages):
            self._tainted = False
            self.trusted_caps = extract_trusted_caps(query, messages)

        from ast import literal_eval
        from agentdojo.agent_pipeline.llms.google_llm import EMPTY_FUNCTION_NAME

        tool_call_results: list[ChatToolResultMessage] = []
        for tool_call in messages[-1]["tool_calls"]:
            fn = tool_call.function
            if fn == EMPTY_FUNCTION_NAME:
                tool_call_results.append(
                    ChatToolResultMessage(
                        role="tool",
                        content=[text_content_block_from_string("")],
                        tool_call_id=tool_call.id,
                        tool_call=tool_call,
                        error="Empty function name provided. Provide a valid function name.",
                    )
                )
                continue
            if fn not in (tool.name for tool in runtime.functions.values()):
                tool_call_results.append(
                    ChatToolResultMessage(
                        role="tool",
                        content=[text_content_block_from_string("")],
                        tool_call_id=tool_call.id,
                        tool_call=tool_call,
                        error=f"Invalid tool {fn} provided.",
                    )
                )
                continue

            args = dict(tool_call.args)
            disposition = (
                classify_sink(fn, args, self.trusted_caps) if self._tainted else None
            )
            if disposition in ("park", "hard_block"):
                self.blocked_calls.append(
                    {
                        "function": fn,
                        "args": args,
                        "mechanism": "clawql_data_flow_taint",
                        "disposition": disposition,
                        "defaults_id": DEFAULTS_ID,
                        "trusted_destinations": sorted(self.trusted_caps.destinations),
                        "trusted_write_tools": sorted(self.trusted_caps.write_tools),
                    }
                )
                if disposition == "park":
                    msg = (
                        f"Parked by ClawQL data-flow: untrusted read may not flow to "
                        f"sink `{fn}` without human approval or a trusted capability "
                        f"from the user query (AgentDojo has no human)."
                    )
                    err = "clawql_parked_data_flow"
                else:
                    msg = (
                        f"Blocked by ClawQL data-flow: untrusted read may not flow "
                        f"to sink `{fn}` (hard block)."
                    )
                    err = "clawql_blocked_data_flow"
                tool_call_results.append(
                    ChatToolResultMessage(
                        role="tool",
                        content=[text_content_block_from_string(msg)],
                        tool_call_id=tool_call.id,
                        tool_call=tool_call,
                        error=err,
                    )
                )
                continue

            # disposition == "allow" after taint → metadata label only (body intact)
            if self._tainted and disposition == "allow":
                meta = record_untrusted_metadata(fn, args)
                if meta is not None:
                    self.labeled_calls.append(meta)

            for arg_k, arg_v in tool_call.args.items():
                if isinstance(arg_v, str) and is_string_list(arg_v):
                    tool_call.args[arg_k] = literal_eval(arg_v)

            tool_call_result, error = runtime.run_function(env, fn, tool_call.args)
            formatted = self.output_formatter(tool_call_result)
            tool_call_results.append(
                ChatToolResultMessage(
                    role="tool",
                    content=[text_content_block_from_string(formatted)],
                    tool_call_id=tool_call.id,
                    tool_call=tool_call,
                    error=error,
                )
            )

            if fn in UNTRUSTED_READ_TOOLS and error is None:
                self._tainted = True

        return query, runtime, env, [*messages, *tool_call_results], extra_args

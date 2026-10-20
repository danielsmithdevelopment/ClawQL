"""
ClawQL-inspired ToolsExecutor for AgentDojo.

Maps ClawQL's untrusted-read taint + sink policy onto AgentDojo's function tools.
After the agent reads untrusted channel content (email / file / message / calendar),
subsequent sinks are classified:

- **allow** — same-workspace destinations that are not privileged membership
  (scripted-board boundary: reply-to-source / internal destinations ≠ exfiltration).
  Untrusted-derived allows are **labeled in ClawQL metadata** (`labeled_calls`),
  not by rewriting message bodies (AgentDojo utility checks often compare content).
- **park** — reversible / privileged effectuation a human would approve (money,
  external email, bookings, **membership & invitations**). AgentDojo has no human,
  so parks still fail the tool — recorded as `disposition=park`.
- **hard_block** — destructive or clear third-party surfaces (delete, External_*,
  post_webpage, share_file)

Same-workspace is not the same as safe: attacks in AgentDojo Slack originate
*inside* the workspace. Membership stays privileged; internal posts are metadata-labeled.

Frozen defaults id: ``clawql_agentdojo_defaults_v2`` (see AGENTDOJO-RULES-DIFF.md).

This is a defense *arm* for AgentDojo scoring (ASR + utility), not a claim that
AgentDojo's FunctionsRuntime is ClawQL MCP.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Sequence
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
DEFAULTS_ID = "clawql_agentdojo_defaults_v2"
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
    }
)

# Candidate sinks that may be allowed when the destination stays in-workspace.
# Membership is NOT here — see PARK_SINKS.
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
# Body/content args are left intact for AgentDojo graders.
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


def classify_sink(fn: str, args: dict[str, Any] | None) -> Disposition | None:
    """Return disposition for a sink after taint, or None if not a controlled sink."""
    if fn not in EXTERNAL_OR_DESTRUCTIVE_SINKS:
        return None
    args = args or {}
    if fn in HARD_BLOCK_SINKS:
        return "hard_block"

    # Membership / invitations: privileged. Outside addresses → hard block;
    # External_* channels → hard block; otherwise park for human approval.
    if fn in (
        "add_user_to_channel",
        "invite_user_to_channel",
        "remove_user_from_channel",
        "add_calendar_event_participants",
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

    if fn == "send_channel_message":
        channel = str(args.get("channel") or "")
        if _EXTERNAL_SLACK_CHANNEL.match(channel):
            return "hard_block"
        return "allow"

    if fn == "send_direct_message":
        return "allow"

    if fn == "send_email":
        recipients = args.get("recipients") or args.get("to") or args.get("recipient") or []
        if isinstance(recipients, str):
            recipients = [recipients]
        if recipients and all(_INTERNAL_EMAIL.search(str(r) or "") for r in recipients):
            return "allow"
        return "park"

    if fn in (
        "create_calendar_event",
        "reschedule_calendar_event",
        "create_file",
        "append_to_file",
    ):
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
            disposition = classify_sink(fn, args) if self._tainted else None
            if disposition in ("park", "hard_block"):
                self.blocked_calls.append(
                    {
                        "function": fn,
                        "args": args,
                        "mechanism": "clawql_data_flow_taint",
                        "disposition": disposition,
                        "defaults_id": DEFAULTS_ID,
                    }
                )
                if disposition == "park":
                    msg = (
                        f"Parked by ClawQL data-flow: untrusted read may not flow to "
                        f"sink `{fn}` without human approval (AgentDojo has no human)."
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

"""
ClawQL-inspired ToolsExecutor for AgentDojo.

Maps ClawQL's untrusted-read taint + external-sink block onto AgentDojo's
function tools. After the agent reads untrusted channel content (email / file /
message), subsequent external or destructive sinks are blocked — same outcome
shape as ClawQL park/label/data-flow on the multi-attack board.

This is a defense *arm* for AgentDojo scoring (ASR + utility), not a claim that
AgentDojo's FunctionsRuntime is ClawQL MCP.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import Any

from agentdojo.agent_pipeline.tool_execution import (
    ToolsExecutor,
    is_string_list,
    tool_result_to_str,
)
from agentdojo.functions_runtime import EmptyEnv, Env, FunctionReturnType, FunctionsRuntime
from agentdojo.types import ChatMessage, ChatToolResultMessage, text_content_block_from_string

# Reads that ingest untrusted / attacker-controlled content into the session.
UNTRUSTED_READ_TOOLS = frozenset(
    {
        # workspace
        "get_unread_emails",
        "get_received_emails",
        "get_draft_emails",
        "search_emails",
        "get_file_by_id",
        "search_files",
        "list_files",
        "search_files_by_filename",
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

# External / destructive sinks ClawQL-style data-flow would stop after taint.
EXTERNAL_OR_DESTRUCTIVE_SINKS = frozenset(
    {
        # workspace
        "send_email",
        "delete_email",
        "share_file",
        "delete_file",
        "create_file",
        "append_to_file",
        "create_calendar_event",
        "cancel_calendar_event",
        "reschedule_calendar_event",
        "add_calendar_event_participants",
        # slack
        "send_channel_message",
        "send_direct_message",
        "invite_user_to_channel",
        "add_user_to_channel",
        "remove_user_from_channel",
        "post_webpage",
        # banking
        "send_money",
        "schedule_transaction",
        "update_scheduled_transaction",
        # travel
        "reserve_hotel",
        "reserve_car_rental",
        "reserve_restaurant",
        "send_email",  # travel suite also emails
    }
)


class ClawQLToolsExecutor(ToolsExecutor):
    """ToolsExecutor that applies ClawQL-style taint → sink blocking."""

    def __init__(
        self,
        tool_output_formatter: Callable[[FunctionReturnType], str] = tool_result_to_str,
    ) -> None:
        super().__init__(tool_output_formatter)
        self._tainted = False
        self.blocked_calls: list[dict[str, Any]] = []

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

            # ClawQL data-flow: tainted session may not flow to external/destructive sinks.
            if self._tainted and fn in EXTERNAL_OR_DESTRUCTIVE_SINKS:
                self.blocked_calls.append(
                    {
                        "function": fn,
                        "args": dict(tool_call.args),
                        "mechanism": "clawql_data_flow_taint",
                    }
                )
                tool_call_results.append(
                    ChatToolResultMessage(
                        role="tool",
                        content=[
                            text_content_block_from_string(
                                "Blocked by ClawQL data-flow: untrusted read may not flow "
                                f"to sink `{fn}` (park / fail-closed)."
                            )
                        ],
                        tool_call_id=tool_call.id,
                        tool_call=tool_call,
                        error="clawql_blocked_data_flow",
                    )
                )
                continue

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

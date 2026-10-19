export {
  EXECUTE_PATH_TOOL_NAMES,
  NATIVE_TOOL_GOVERNANCE_MODULE_ID,
  NATIVE_TOOL_POLICY,
  UNTRUSTED_SPEC_LABELS,
  isExecutePathTool,
  resolveNativeToolPolicy,
  type NativeToolKind,
  type NativeToolPolicy,
} from "./native-tool-policy.js";
export {
  accumulateNativeToolReadAfterSuccess,
  classifyNativeTool,
  gateNativeToolBeforeInvoke,
  governNativeHandler,
  taintSessionFromUntrustedChannel,
  type NativeToolGateBlock,
} from "./native-tool-gate.js";

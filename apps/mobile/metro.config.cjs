/**
 * Metro tuning for PhoneApprove bundle weight.
 *
 * expo-router's Android NativeTabs path imports expo-symbols →
 * @expo-google-fonts/material-symbols (~1MB+ TTF) even when unused.
 * Alias that converter to the no-op stub shipped by expo-router.
 * See: https://github.com/expo/expo/issues/43614
 */
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

const MATERIAL_ICON_STUB = path.resolve(
  __dirname,
  "node_modules/expo-router/build/native-tabs/utils/materialIconConverter-not-implemented.js"
);

const upstreamResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === "android" &&
    typeof moduleName === "string" &&
    moduleName.includes("native-tabs/utils/materialIconConverter") &&
    !moduleName.includes("not-implemented")
  ) {
    return { type: "sourceFile", filePath: MATERIAL_ICON_STUB };
  }

  if (upstreamResolve) {
    return upstreamResolve(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

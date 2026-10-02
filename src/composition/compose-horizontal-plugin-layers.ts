/**
 * Horizontal plugin Layer composition — dynamic (production) and static (tests / sync bootstrap).
 *
 * @see compose-horizontal-plugin-layers-dynamic.ts
 * @see compose-horizontal-plugin-layers-static.ts
 */

export {
  composeHorizontalPluginLayersDynamic,
  composeHorizontalPluginLayersDynamicEffect,
  composeHorizontalPluginLayersDynamicFromTierSpec,
  type ComposeHorizontalPluginLayersOptions,
} from "./compose-horizontal-plugin-layers-dynamic.js";

export {
  composeHorizontalPluginLayersStatic,
  composeHorizontalPluginLayersFromTierSpecStatic,
  optionalFlagsFromHorizontalTierSpec,
  type ClawQLHorizontalTierSpec,
} from "./compose-horizontal-plugin-layers-static.js";

import {
  composeHorizontalPluginLayersStatic,
  composeHorizontalPluginLayersFromTierSpecStatic,
} from "./compose-horizontal-plugin-layers-static.js";

/**
 * @deprecated Prefer {@link composeHorizontalPluginLayersDynamic} or {@link ensureClawqlApi}.
 */
export const composeHorizontalPluginLayers = composeHorizontalPluginLayersStatic;

/**
 * @deprecated Prefer {@link composeHorizontalPluginLayersDynamicFromTierSpec} or {@link ensureClawqlApi}.
 */
export const composeHorizontalPluginLayersFromTierSpec =
  composeHorizontalPluginLayersFromTierSpecStatic;

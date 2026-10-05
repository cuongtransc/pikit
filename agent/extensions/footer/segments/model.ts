import type { RenderedSegment, SegmentContext } from "../types.js";
import { applyColor } from "../theme.js";
import { color } from "./helpers.js";
import { loadAliasChains } from "../alias-chain.js";

/** True when the alias status target is a non-head entry of the alias's fallback chain. */
function isFallbackTarget(
  aliasName: string,
  status: { target: string; provider?: string },
): boolean {
  const chains = loadAliasChains();
  if (!chains) return false;
  const chain = chains.get(aliasName);
  if (!chain || chain.length === 0) return false;
  // Compare the full provider/model ref so duplicate model ids under different
  // providers still resolve to the right chain position.
  const ref = status.provider ? `${status.provider}/${status.target}` : status.target;
  return chain.indexOf(ref) > 0;
}

export const modelSegment = {
  id: "model" as const,
  render(ctx: SegmentContext): RenderedSegment {
    const selectedName = ctx.model?.name || ctx.model?.id || "no-model";
    let modelName = selectedName;

    if (modelName.startsWith("Claude ")) {
      modelName = modelName.slice(7);
    }

    let content = color(ctx, "model", modelName);

    // The producer's `model-alias` status holds the target that served the
    // last turn (or the selected target before the first turn); it is not a
    // prediction of the next turn after a cooldown expires. Width truncation
    // is left to buildFooterContent, which knows the row budget.
    if (ctx.model?.provider === "alias" && ctx.aliasStatus?.target) {
      const aliasLabels = ctx.options.model?.aliasLabels;
      if (aliasLabels !== undefined && aliasLabels !== null) {
        // Short-label mode: `<label>→<model>`, or `<label>↓<model>` when the
        // served target is a fallback past the head of the alias chain. Look
        // aliases up by their real id, before the display-only Claude-prefix strip.
        const label = Object.hasOwn(aliasLabels, selectedName) ? aliasLabels[selectedName] : selectedName;
        const fallback = isFallbackTarget(selectedName, ctx.aliasStatus);
        const arrow = applyColor(ctx.theme, "dim", fallback ? "↓" : "→");
        const target = fallback
          ? applyColor(ctx.theme, "warning", ctx.aliasStatus.target)
          : color(ctx, "model", ctx.aliasStatus.target);
        content = color(ctx, "model", label) + arrow + target;
        if (ctx.aliasStatus.cooldown) {
          content += ` ${applyColor(ctx.theme, "dim", `· ${ctx.aliasStatus.cooldown}`)}`;
        }
        return { content, visible: true };
      }

      content += ` ${applyColor(ctx.theme, "dim", "→")} ${color(ctx, "model", ctx.aliasStatus.target)}`;
      if (ctx.aliasStatus.cooldown) {
        content += ` ${applyColor(ctx.theme, "dim", `· ${ctx.aliasStatus.cooldown}`)}`;
      }
      return { content, visible: true };
    }

    if (ctx.model?.provider) {
      content += ` ${applyColor(ctx.theme, "dim", `(${ctx.model.provider})`)}`;
    }

    if (ctx.routedModel) {
      const routed = ctx.routedModel;
      content += ` ${applyColor(ctx.theme, "dim", "→")} ${color(ctx, "model", routed.id)}`;
      content += ` ${applyColor(ctx.theme, "dim", `(${routed.provider})`)}`;
      if (routed.thinkingLevel) {
        content += ` ${applyColor(ctx.theme, "dim", `• ${routed.thinkingLevel}`)}`;
      }
    }

    return { content, visible: true };
  },
};

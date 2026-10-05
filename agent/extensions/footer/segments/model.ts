import type { RenderedSegment, SegmentContext } from "../types.js";
import { applyColor } from "../theme.js";
import { color } from "./helpers.js";

export const modelSegment = {
  id: "model" as const,
  render(ctx: SegmentContext): RenderedSegment {
    let modelName = ctx.model?.name || ctx.model?.id || "no-model";

    if (modelName.startsWith("Claude ")) {
      modelName = modelName.slice(7);
    }

    let content = color(ctx, "model", modelName);

    // The producer's `model-alias` status holds the target that served the
    // last turn (or the selected target before the first turn); it is not a
    // prediction of the next turn after a cooldown expires. Width truncation
    // is left to buildFooterContent, which knows the row budget.
    if (ctx.model?.provider === "alias" && ctx.aliasStatus?.target) {
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

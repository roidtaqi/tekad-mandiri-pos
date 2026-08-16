import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { type ReactElement, type ReactNode } from "react";

import { classNames } from "./internal/class-names";

export type TooltipSide = "top" | "right" | "bottom" | "left";
export type TooltipAlign = "start" | "center" | "end";

export interface TooltipProps {
  align?: TooltipAlign;
  children: ReactElement;
  className?: string;
  content: ReactNode;
  delayDuration?: number;
  side?: TooltipSide;
  sideOffset?: number;
}

export function Tooltip({
  align = "center",
  children,
  className,
  content,
  delayDuration = 400,
  side = "top",
  sideOffset = 6,
}: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            align={align}
            className={classNames("ks-root", "ks-tooltip", className)}
            side={side}
            sideOffset={sideOffset}
          >
            {content}
            <TooltipPrimitive.Arrow className="ks-tooltip__arrow" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

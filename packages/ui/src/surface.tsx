import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { classNames } from "./internal/class-names";

export type SurfaceElevation = 0 | 1 | 2 | 3;
export type SurfacePadding = "none" | "compact" | "default" | "spacious";
export type SurfaceTone = "default" | "muted" | "elevated";

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  elevation?: SurfaceElevation;
  padding?: SurfacePadding;
  tone?: SurfaceTone;
}

export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(
  function Surface(
    {
      children,
      className,
      elevation = 0,
      padding = "default",
      tone = "default",
      ...props
    },
    ref,
  ) {
    return (
      <div
        {...props}
        className={classNames("ks-surface", className)}
        data-elevation={elevation}
        data-padding={padding}
        data-tone={tone}
        ref={ref}
      >
        {children}
      </div>
    );
  },
);

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: SurfacePadding;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { children, className, padding = "default", ...props },
  ref,
) {
  return (
    <div
      {...props}
      className={classNames("ks-card", className)}
      data-padding={padding}
      ref={ref}
    >
      {children}
    </div>
  );
});

export type DividerOrientation = "horizontal" | "vertical";

export interface DividerProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: DividerOrientation;
}

export const Divider = forwardRef<HTMLDivElement, DividerProps>(
  function Divider(
    { className, orientation = "horizontal", ...props },
    ref,
  ) {
    return (
      <div
        {...props}
        aria-orientation={orientation}
        className={classNames("ks-divider", className)}
        data-orientation={orientation}
        ref={ref}
        role="separator"
      />
    );
  },
);

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { classNames } from "./internal/class-names";

export type ContainerSize = "narrow" | "default" | "wide" | "fluid";

export interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  size?: ContainerSize;
}

export const Container = forwardRef<HTMLDivElement, ContainerProps>(
  function Container(
    { children, className, size = "fluid", ...props },
    ref,
  ) {
    return (
      <div
        {...props}
        className={classNames("ks-container", className)}
        data-size={size}
        ref={ref}
      >
        {children}
      </div>
    );
  },
);

export type LayoutAlignment = "start" | "center" | "end" | "stretch";
export type LayoutGap = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16 | 20;

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  align?: LayoutAlignment;
  children: ReactNode;
  gap?: LayoutGap;
}

export const Stack = forwardRef<HTMLDivElement, StackProps>(function Stack(
  { align = "stretch", children, className, gap = 4, ...props },
  ref,
) {
  return (
    <div
      {...props}
      className={classNames("ks-stack", className)}
      data-align={align}
      data-gap={gap}
      ref={ref}
    >
      {children}
    </div>
  );
});

export type InlineJustification =
  | "start"
  | "center"
  | "end"
  | "between"
  | "around";

export interface InlineProps extends HTMLAttributes<HTMLDivElement> {
  align?: LayoutAlignment;
  children: ReactNode;
  gap?: LayoutGap;
  justify?: InlineJustification;
  wrap?: boolean;
}

export const Inline = forwardRef<HTMLDivElement, InlineProps>(function Inline(
  {
    align = "center",
    children,
    className,
    gap = 3,
    justify = "start",
    wrap = true,
    ...props
  },
  ref,
) {
  return (
    <div
      {...props}
      className={classNames("ks-inline", className)}
      data-align={align}
      data-gap={gap}
      data-justify={justify}
      data-wrap={wrap}
      ref={ref}
    >
      {children}
    </div>
  );
});

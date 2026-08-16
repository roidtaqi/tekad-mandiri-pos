import {
  createElement,
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { classNames } from "./internal/class-names";

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type HeadingSize = "display" | "h1" | "h2" | "h3";

export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  children: ReactNode;
  level?: HeadingLevel;
  numeric?: boolean;
  size?: HeadingSize;
}

export const Heading = forwardRef<HTMLHeadingElement, HeadingProps>(
  function Heading(
    {
      children,
      className,
      level = 2,
      numeric = false,
      size = "h2",
      ...props
    },
    ref,
  ) {
    return createElement(
      `h${level}`,
      {
        ...props,
        className: classNames(
          "ks-heading",
          `ks-heading--${size}`,
          numeric && "ks-numeric",
          className,
        ),
        "data-numeric": numeric || undefined,
        "data-size": size,
        ref,
      },
      children,
    );
  },
);

export type TextElement = "div" | "p" | "span";
export type TextSize = "large" | "body" | "small" | "caption" | "micro";
export type TextTone = "primary" | "secondary" | "muted" | "inverse";
export type TextWeight = "regular" | "medium" | "semibold" | "bold";

export interface TextProps extends HTMLAttributes<HTMLElement> {
  as?: TextElement;
  children: ReactNode;
  numeric?: boolean;
  size?: TextSize;
  tone?: TextTone;
  weight?: TextWeight;
}

export const Text = forwardRef<HTMLElement, TextProps>(function Text(
  {
    as = "p",
    children,
    className,
    numeric = false,
    size = "body",
    tone = "primary",
    weight = "regular",
    ...props
  },
  ref,
) {
  return createElement(
    as,
    {
      ...props,
      className: classNames(
        "ks-text",
        `ks-text--${size}`,
        `ks-text--${tone}`,
        `ks-text--${weight}`,
        numeric && "ks-numeric",
        className,
      ),
      "data-numeric": numeric || undefined,
      "data-size": size,
      "data-tone": tone,
      "data-weight": weight,
      ref,
    },
    children,
  );
});

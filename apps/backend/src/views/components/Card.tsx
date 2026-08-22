import type { FC, PropsWithChildren } from "hono/jsx";

export interface CardProps {
  class?: string;
}

export const Card: FC<PropsWithChildren<CardProps>> = ({
  class: className,
  children,
}) => {
  const classes = [
    "rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-10",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <div class={classes}>{children}</div>;
};

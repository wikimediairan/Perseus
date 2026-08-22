import type { FC, PropsWithChildren } from "hono/jsx";

export interface ButtonProps {
  href?: string;
  type?: "button" | "submit";
  variant?: "primary" | "secondary";
  class?: string;
}

const BASE_CLASSES =
  "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold " +
  "transition-colors duration-150 focus-visible:outline focus-visible:outline-2 " +
  "focus-visible:outline-offset-2 focus-visible:outline-indigo-400";

const VARIANT_CLASSES = {
  primary:
    "bg-indigo-500 text-white hover:bg-indigo-400 shadow-lg shadow-indigo-950/40",
  secondary:
    "bg-white/10 text-slate-100 hover:bg-white/20 border border-white/10",
} as const;

export const Button: FC<PropsWithChildren<ButtonProps>> = ({
  href,
  type = "button",
  variant = "primary",
  class: className,
  children,
}) => {
  const classes = [BASE_CLASSES, VARIANT_CLASSES[variant], className]
    .filter(Boolean)
    .join(" ");

  if (href) {
    return (
      <a href={href} class={classes}>
        {children}
      </a>
    );
  }

  return (
    <button type={type} class={classes}>
      {children}
    </button>
  );
};

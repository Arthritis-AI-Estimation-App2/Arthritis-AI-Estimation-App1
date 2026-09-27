import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: [
    "variant",
    '@media (prefers-color-scheme: dark) { &:where([data-dark-mode-enabled="true"], [data-dark-mode-enabled="true"] *) }',
  ],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--color-background) / <alpha-value>)",
        surface: {
          DEFAULT: "rgb(var(--color-surface) / <alpha-value>)",
          muted: "rgb(var(--color-surface-muted) / <alpha-value>)",
          hover: "rgb(var(--color-surface-hover) / <alpha-value>)",
        },
        foreground: "rgb(var(--color-foreground) / <alpha-value>)",
        "secondary-foreground": "rgb(var(--color-secondary-foreground) / <alpha-value>)",
        "muted-foreground": "rgb(var(--color-muted-foreground) / <alpha-value>)",
        "subtle-foreground": "rgb(var(--color-subtle-foreground) / <alpha-value>)",
        border: {
          DEFAULT: "rgb(var(--color-border) / <alpha-value>)",
          strong: "rgb(var(--color-border-strong) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "rgb(var(--color-primary) / <alpha-value>)",
          hover: "rgb(var(--color-primary-hover) / <alpha-value>)",
          foreground: "rgb(var(--color-primary-foreground) / <alpha-value>)",
          subtle: "rgb(var(--color-primary-subtle) / <alpha-value>)",
          "subtle-foreground": "rgb(var(--color-primary-subtle-foreground) / <alpha-value>)",
        },
        link: "rgb(var(--color-link) / <alpha-value>)",
        focus: "rgb(var(--color-focus) / <alpha-value>)",
        tooltip: {
          DEFAULT: "rgb(var(--color-tooltip) / <alpha-value>)",
          foreground: "rgb(var(--color-tooltip-foreground) / <alpha-value>)",
          muted: "rgb(var(--color-tooltip-muted) / <alpha-value>)",
          danger: "rgb(var(--color-tooltip-danger) / <alpha-value>)",
        },
        disabled: {
          DEFAULT: "rgb(var(--color-disabled) / <alpha-value>)",
          foreground: "rgb(var(--color-disabled-foreground) / <alpha-value>)",
        },
        info: {
          DEFAULT: "rgb(var(--color-info) / <alpha-value>)",
          foreground: "rgb(var(--color-info-foreground) / <alpha-value>)",
          solid: "rgb(var(--color-info-solid) / <alpha-value>)",
          "solid-hover": "rgb(var(--color-info-solid-hover) / <alpha-value>)",
          "solid-foreground": "rgb(var(--color-info-solid-foreground) / <alpha-value>)",
        },
        success: {
          DEFAULT: "rgb(var(--color-success) / <alpha-value>)",
          foreground: "rgb(var(--color-success-foreground) / <alpha-value>)",
          border: "rgb(var(--color-success-border) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "rgb(var(--color-warning) / <alpha-value>)",
          foreground: "rgb(var(--color-warning-foreground) / <alpha-value>)",
          border: "rgb(var(--color-warning-border) / <alpha-value>)",
        },
        danger: {
          DEFAULT: "rgb(var(--color-danger) / <alpha-value>)",
          foreground: "rgb(var(--color-danger-foreground) / <alpha-value>)",
          border: "rgb(var(--color-danger-border) / <alpha-value>)",
          solid: "rgb(var(--color-danger-solid) / <alpha-value>)",
          "solid-hover": "rgb(var(--color-danger-solid-hover) / <alpha-value>)",
          "solid-foreground": "rgb(var(--color-danger-solid-foreground) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};

export default config;

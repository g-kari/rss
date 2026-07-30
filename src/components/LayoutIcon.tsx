import type { Layout } from "../types";

interface Props {
  layout: Layout;
}

export default function LayoutIcon({ layout }: Props) {
  switch (layout) {
    case "compact":
      return (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor" aria-hidden="true">
          <rect x="0" y="1" width="13" height="1.5" rx="0.75" />
          <rect x="0" y="5" width="13" height="1.5" rx="0.75" />
          <rect x="0" y="9" width="13" height="1.5" rx="0.75" />
        </svg>
      );
    case "list":
      return (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor" aria-hidden="true">
          <rect x="0" y="0.5" width="13" height="2" rx="0.75" />
          <rect x="0" y="4" width="9" height="1" rx="0.5" />
          <rect x="0" y="7" width="13" height="2" rx="0.75" />
          <rect x="0" y="10.5" width="9" height="1" rx="0.5" />
        </svg>
      );
    case "card":
      return (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor" aria-hidden="true">
          <rect x="0" y="0" width="5.5" height="5.5" rx="1" />
          <rect x="7.5" y="0" width="5.5" height="5.5" rx="1" />
          <rect x="0" y="7.5" width="5.5" height="5.5" rx="1" />
          <rect x="7.5" y="7.5" width="5.5" height="5.5" rx="1" />
        </svg>
      );
    case "magazine":
      return (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor" aria-hidden="true">
          <rect x="0" y="0" width="13" height="7" rx="1" />
          <rect x="0" y="9" width="5.5" height="4" rx="0.75" />
          <rect x="7.5" y="9" width="5.5" height="4" rx="0.75" />
        </svg>
      );
    case "gallery":
      return (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor" aria-hidden="true">
          <rect x="0" y="0" width="5.5" height="5" rx="1" />
          <rect x="7.5" y="0" width="5.5" height="3" rx="1" />
          <rect x="7.5" y="4.5" width="5.5" height="4" rx="1" />
          <rect x="0" y="6.5" width="5.5" height="6.5" rx="1" />
          <rect x="7.5" y="10" width="5.5" height="3" rx="1" />
        </svg>
      );
  }
}

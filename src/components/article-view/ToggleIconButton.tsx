import type { ReactNode } from "react";

interface Props {
  isActive: boolean;
  onClick: () => void;
  title: string;
  /** 安定したアクセシビリティ名。指定時は aria-label に使用し、title はツールチップのみに使う。
   *  未指定時は title にフォールバックする。 */
  ariaLabel?: string;
  activeClass: string;
  inactiveClass: string;
  children: ReactNode;
}

export default function ToggleIconButton({
  isActive,
  onClick,
  title,
  ariaLabel,
  activeClass,
  inactiveClass,
  children,
}: Props) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={ariaLabel ?? title}
      aria-pressed={isActive}
      className={`p-2 -m-2 max-md:min-w-[44px] max-md:min-h-[44px] lg:p-0 lg:m-0 lg:min-w-[24px] lg:min-h-[24px] transition-colors duration-200 [&>svg]:w-[18px] [&>svg]:h-[18px] lg:[&>svg]:w-[14px] lg:[&>svg]:h-[14px] ${isActive ? activeClass : inactiveClass}`}
    >
      {children}
    </button>
  );
}

import React from "react";

interface Props {
  isActive: boolean;
  onClick: () => void;
  title: string;
  activeClass: string;
  inactiveClass: string;
  children: React.ReactNode;
}

export default function ToggleIconButton({
  isActive,
  onClick,
  title,
  activeClass,
  inactiveClass,
  children,
}: Props) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-2 -m-2 lg:p-0 lg:m-0 transition-colors duration-200 [&>svg]:w-[18px] [&>svg]:h-[18px] lg:[&>svg]:w-[14px] lg:[&>svg]:h-[14px] ${isActive ? activeClass : inactiveClass}`}
    >
      {children}
    </button>
  );
}

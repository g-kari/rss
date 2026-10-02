import type { ReactNode } from "react";
import { SETTINGS_CATEGORIES, type SettingsCategoryId } from "./settings-catalog";

export default function SettingsCategoryPanel({
  id,
  hidden,
  children,
}: {
  id: SettingsCategoryId;
  hidden: boolean;
  children: ReactNode;
}) {
  const category = SETTINGS_CATEGORIES.find((item) => item.id === id)!;
  return (
    <section
      id={`panel-${id}`}
      role="tabpanel"
      aria-labelledby={`tab-${id}`}
      hidden={hidden}
      tabIndex={-1}
    >
      <div className="flex min-w-0 flex-col gap-5 px-5 py-4">
        <div>
          <h3 className="text-[14px] font-medium text-text-strong">{category.label}</h3>
          <p className="mt-1 text-[12px] text-text-muted">{category.description}</p>
        </div>
        {children}
      </div>
    </section>
  );
}

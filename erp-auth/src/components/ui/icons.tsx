import type { SVGProps } from 'react';

/**
 * A small hand-rolled icon set. One consistent stroke weight and cap style
 * keeps the interface coherent without pulling in an icon dependency.
 */
type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      width="1em"
      height="1em"
      {...props}
    >
      {children}
    </svg>
  );
}

export const BackspaceIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M21 5H9.6a2 2 0 0 0-1.5.7L3 12l5.1 6.3a2 2 0 0 0 1.5.7H21a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z" />
    <path d="m17 9-5 6M12 9l5 6" />
  </Base>
);

export const CloseIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Base>
);

export const QrIcon = (props: IconProps) => (
  <Base {...props}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <path d="M14 14h3v3h-3zM21 14v3M21 21h-4M17 21h-3" />
  </Base>
);

export const MailIcon = (props: IconProps) => (
  <Base {...props}>
    <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
    <path d="m3.5 7 7.6 5.2a2 2 0 0 0 2.2 0L21 7" />
  </Base>
);

export const LockIcon = (props: IconProps) => (
  <Base {...props}>
    <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" />
    <path d="M8 10.5V7.8a4 4 0 1 1 8 0v2.7" />
  </Base>
);

export const ShieldIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 2.8 20 6v6.2c0 4.4-3.2 7.9-8 9.1-4.8-1.2-8-4.7-8-9.1V6l8-3.2Z" />
    <path d="m9 12 2.2 2.2L15.4 10" />
  </Base>
);

export const CheckIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="m5 12.6 4.6 4.6L19 7.5" />
  </Base>
);

export const AlertIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 3.6 22 20H2L12 3.6Z" />
    <path d="M12 10v4.2M12 17.2h.01" />
  </Base>
);

export const UserIcon = (props: IconProps) => (
  <Base {...props}>
    <circle cx="12" cy="8.5" r="3.8" />
    <path d="M4.5 20.4a7.5 7.5 0 0 1 15 0" />
  </Base>
);

export const LogoutIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M14.5 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8" />
    <path d="M18 8.5 21.5 12 18 15.5M21 12H10" />
  </Base>
);

export const PlusIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const SearchIcon = (props: IconProps) => (
  <Base {...props}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Base>
);

export const ChevronIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="m9 5 7 7-7 7" />
  </Base>
);

export const RefreshIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20 4v4.5h-4.5" />
  </Base>
);

export const DeviceIcon = (props: IconProps) => (
  <Base {...props}>
    <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
    <path d="M11 18.5h2" />
  </Base>
);

export const ListIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01" />
  </Base>
);

/** Module glyphs, keyed by the module rows stored in the database. */
const MODULE_ICONS: Record<string, (props: IconProps) => React.ReactElement> = {
  cashier: (props) => (
    <Base {...props}>
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M7 8V5.5A1.5 1.5 0 0 1 8.5 4h7A1.5 1.5 0 0 1 17 5.5V8M7 13h4M7 16.5h7" />
    </Base>
  ),
  inventory: (props) => (
    <Base {...props}>
      <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z" />
      <path d="M3 7.5 12 12l9-4.5M12 12v9" />
    </Base>
  ),
  invoices: (props) => (
    <Base {...props}>
      <path d="M6 3h12v18l-3-1.6-3 1.6-3-1.6L6 21V3Z" />
      <path d="M9.5 8h5M9.5 12h5" />
    </Base>
  ),
  debts: (props) => (
    <Base {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v10M14.8 9.2A2.8 2.8 0 0 0 12 8c-1.7 0-2.8.9-2.8 2s1.1 2 2.8 2 2.8.9 2.8 2-1.1 2-2.8 2a2.8 2.8 0 0 1-2.8-1.2" />
    </Base>
  ),
  customers: (props) => (
    <Base {...props}>
      <circle cx="9" cy="8.5" r="3.4" />
      <path d="M2.8 20a6.2 6.2 0 0 1 12.4 0M16 5.4a3.4 3.4 0 0 1 0 6.5M17.5 14.4A6.2 6.2 0 0 1 21.2 20" />
    </Base>
  ),
  maintenance: (props) => (
    <Base {...props}>
      <path d="M14.7 6.3a4 4 0 0 0 5.2 5.2l-8.4 8.4a2.4 2.4 0 0 1-3.4-3.4l8.4-8.4Z" />
      <path d="M14.7 6.3 17.5 3.5M6.5 15.5 3.5 18.5" />
    </Base>
  ),
  expenses: (props) => (
    <Base {...props}>
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 12h.01M18 12h.01" />
    </Base>
  ),
  reports: (props) => (
    <Base {...props}>
      <path d="M4 20V4M4 20h16" />
      <path d="M8.5 20v-6M13 20V8M17.5 20v-9" />
    </Base>
  ),
  employees: (props) => (
    <Base {...props}>
      <circle cx="12" cy="7.5" r="3.4" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M18.5 6.5h4M20.5 4.5v4" />
    </Base>
  ),
  settings: (props) => (
    <Base {...props}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5" />
    </Base>
  ),
};

export function ModuleIcon({ module, ...props }: IconProps & { module: string }) {
  const Icon = MODULE_ICONS[module] ?? ListIcon;
  return <Icon {...props} />;
}

export function Spinner({ className = '', label = 'جارٍ التحميل' }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label} className={`inline-flex ${className}`}>
      <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" className="animate-spin">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

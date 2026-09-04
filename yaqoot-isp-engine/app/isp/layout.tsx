import type { ReactNode } from 'react';
import { ProviderProvider } from '@/components/isp/ProviderContext';
import { Shell } from '@/components/isp/Shell';

export default function IspLayout({ children }: { children: ReactNode }) {
  return (
    <ProviderProvider>
      <Shell>{children}</Shell>
    </ProviderProvider>
  );
}

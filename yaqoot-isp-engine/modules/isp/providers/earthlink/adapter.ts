import type { CapabilityManifest } from '../../capabilities/manifest';
import { operatorMessage } from '../../core/errors';
import type { Provider } from '../../core/types';
import type { AuthOutcome, AuthRequirements, AuthStatus } from '../core/auth';
import type { ISPProviderAdapter, ProviderSession } from '../core/adapter';
import { EARTHLINK_CAPABILITIES, EARTHLINK_INTEGRATION_STATUS } from './capabilities';

/**
 * Earthlink adapter — DECLARED BOUNDARY, NOT AN IMPLEMENTATION.
 *
 * This file deliberately contains no HTTP calls, no endpoints, no request
 * shapes and no token handling. Spec §1 forbids inventing undocumented API
 * behaviour, and no official Earthlink reseller API documentation was
 * available. Fabricating one would produce code that looks finished and fails
 * in production against a real agent account and real money.
 *
 * What this file *does* provide is the seam: the provider profile, the
 * capability manifest (all `unknown`), and an authentication surface that
 * fails closed with an operator-safe Arabic message. Register it and the ERP
 * shows Earthlink as a known-but-unconfigured provider instead of pretending.
 *
 * See docs/provider-adapter-guide.md for the implementation checklist.
 */
export function createEarthlinkAdapter(): ISPProviderAdapter {
  const notConfigured: AuthOutcome = {
    state: 'ERROR',
    reason: 'UNSUPPORTED_AUTH_METHOD',
    message:
      'تكامل هذا المزود غير مُفعّل بعد — بانتظار وثائق الواجهة البرمجية الرسمية وبيانات الوكيل.',
  };

  return {
    key: 'earthlink',

    async getProviderProfile(): Promise<Provider> {
      const timestamp = new Date().toISOString();
      return {
        id: 'earthlink',
        name: 'earthlink',
        displayName: 'Earthlink',
        logoUrl: null,
        accentColor: null,
        country: 'IQ',
        currency: 'IQD',
        timezone: 'Asia/Baghdad',
        // `inactive` keeps it visible in the provider list and the capability
        // matrix while blocking every operation.
        status: 'inactive',
        adapterKey: 'earthlink',
        apiVersion: null,
        supportUrl: null,
        configuration: { integration: EARTHLINK_INTEGRATION_STATUS },
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    },

    async getCapabilities(): Promise<CapabilityManifest> {
      return EARTHLINK_CAPABILITIES;
    },

    async getAuthenticationRequirements(): Promise<AuthRequirements> {
      // No documented auth method, so no fields are invented. The login modal
      // renders the "not configured" state instead of a fake form.
      return {
        methods: [
          {
            kind: 'none',
            id: 'unconfigured',
            label: 'التكامل غير مُفعّل',
            description:
              'يتطلب هذا المزود وثائق واجهة برمجية رسمية وبيانات وكيل قبل تفعيل الاتصال.',
            fields: [],
            requiresSecondFactor: false,
          },
        ],
        defaultMethodId: 'unconfigured',
        sessionDurationSeconds: null,
        allowPersistentSession: false,
        helpUrl: null,
      };
    },

    async authenticate(): Promise<AuthOutcome> {
      return notConfigured;
    },

    async getAuthenticationStatus(_session: ProviderSession): Promise<AuthStatus> {
      return {
        state: 'UNAUTHENTICATED',
        expiresAt: null,
        agentDisplayName: null,
        lastCheckedAt: new Date().toISOString(),
      };
    },

    async logout(): Promise<void> {
      // Nothing to revoke: no session is ever established.
    },

    async testConnection() {
      return {
        state: 'FAILED' as const,
        reason: 'UNSUPPORTED_OPERATION' as const,
        message: operatorMessage('UNSUPPORTED_OPERATION'),
        diagnostics: { requestId: 'earthlink-unconfigured', adapterKey: 'earthlink' },
      };
    },
  };
}

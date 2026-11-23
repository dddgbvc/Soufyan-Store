# Yaqoot Earthlink iOS QuickTest (Unsigned)

Standalone read-only SwiftUI test application for an authorized Earthlink reseller account.

- Uses POST /token, GET /affiliate, GET /affiliate/deposit/balance, POST /user/all, and GET /user/{id} against the reseller API found in an Android app export.
- API behaviour has **not been verified against a live authorized reseller account**. Login and response contracts may change.
- **No payments, renewals, account creation or disconnect mutations.** Password and bearer token are not stored permanently.
- This code is separate from the storefront and does not modify Yaqoot ERP's original IPA, push notification entitlements, or widgets.

## Build unsigned IPA

From GitHub repository root open **Actions → Earthlink iOS QuickTest unsigned IPA**. It runs on push to main touching the iOS test folder, or you may use **Run workflow**. Download the resulting **Yaqoot-Earthlink-QuickTest-UNSIGNED** artifact and extract the .ipa to sign with ESign.

Bundle ID: iq.yaqoot.earthlink.quicktest. Deployment target: iOS 17 or later. Change bundle ID at signing if your provisioning requires it. Do **not** commit credentials, certificates, or provisioning profiles to this public repository.

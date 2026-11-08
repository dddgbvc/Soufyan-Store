# ياقوت — مكتب سفيان للموبايل (v7)

> **الجديد في v7:** دخول بحساب المحل ثم PIN يحدد الموظف، وبيانات حقيقية من Supabase، وأقسام حسب صلاحيات الموظف. التفاصيل والإعداد ونتيجة المقارنة مع قاعدة البيانات في [UPGRADE-AR.md](UPGRADE-AR.md).
> الأقسام أدناه تصف الإصدار 6 التجريبي، وبقيت للمرجع.


Arabic RTL web application for exploring Yaqoot ERP workflows with editable demonstration data.

## Running

Use the Sites dependency installer and build-site helper. Framework: React + Vinext. Main UI: `app/page.tsx`; domain fixture and field schema: `app/data.ts`; styling: `app/globals.css`.

## Included

- Dashboard with derived sales, outstanding customer debt, inventory cost valuation and cash balance.
- Searchable and filterable invoice, debt, stock, supplier, equipment, shipping, ISP and task pages.
- New sales reduce stock; cash sales create a vault receipt; credit sales create a customer debt.
- Customer and supplier settlements validate the remaining balance and generate cash ledger movements.
- Invoice customer names and notes may be amended; posted amounts and quantities stay fixed.
- Editable bundles, ISP renewal simulation, read-only vault, local sync queue simulation.
- Current-day/current-month/all-time sales reports, last-seven-day chart, CSV exports and validated JSON backup import/export.
- Persisted browser state, light/dark themes, responsive layout, labeled controls and keyboard modal dismissal/focus containment.

## Data and integration boundary

All initial names, phone numbers, transactions and quantities are demonstration fixtures. They do not represent actual store records. The balance examples include opening balances and are not a complete accounting history.

`localStorage` key `yaqoot-demo-v1` saves data for one browser only. This is a prototype of local-first behavior, not a production synchronization engine. No Supabase, ISP or courier request is performed. The connection toggle and queue retry explicitly simulate operation. Clearing browser data removes these records; use JSON export for a portable backup.

A future production adapter must implement authenticated backend APIs, store-scoped authorization, transactional/idempotent writes, versioned migrations, conflict handling, durable queues, invoice cost snapshots, audited reversals and provider credentials held server-side. Do not put service credentials in this frontend or localStorage.

## Validation

TypeScript no-emit check and Sites production build. Browser checks cover dashboard rendering, cash invoice effects, settlement overpayment rejection, valid settlement persistence after reload, search/status filtering, navigation and synchronization simulation.

## Typography and welcome

The supplied Thmanyah Sans is the default. Cairo and El Messiri can be selected in workspace settings with live samples. Fonts are served by this Site, and preferences persist without resetting existing records. Unmodified Thmanyah bytes are packaged into the compiled stylesheet; the supplied license is retained in `licenses/`.

A dismissible 3.2-second welcome card appears once per tab session, with disable and replay controls. Short staggered entry animations decorate page content. Reduced-motion preference suppresses both welcome and animations.

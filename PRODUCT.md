# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

OneRent serves both professional property managers and property owners who manage rental portfolios directly. Professional property managers are the primary audience. They need to coordinate operational, contractual, financial, and reporting work across multiple properties and portfolios without losing the connection between records.

## Product Purpose

OneRent is a rental property management application for the Belgian and broader European markets. It centralizes the day-to-day management of properties, units, tenants, leases, receivables, payments, maintenance, vendors, costs, allocations, and portfolio reporting.

Success means that a manager can understand the current state of a portfolio quickly, complete recurring work efficiently, and rely on the application to keep contractual, occupancy, and financial data consistent.

## Positioning

OneRent is not positioned around a unique mechanism that conventional property management software could not offer. It competes through the breadth and usefulness of its functionality, the quality of its design, and the clarity and reliability of the complete management experience.

## Operating Context

Users work across portfolios containing properties and units, with role-based collaboration for owners, administrators, editors, and viewers. Core workflows include:

- creating and maintaining properties, ownership information, units, and tenants;
- creating leases, assigning units, managing lifecycle changes, amendments, contractual documents, notice, move-in, and move-out;
- generating and reconciling receivables, recording cash receipts, and tracking allocations;
- managing maintenance tickets and vendors;
- recording property and unit costs, defining allocation rules, handling co-ownership shares, partial ownership, recoverability, and amortization;
- reviewing operational performance, profitability, occupancy, overdue balances, lease expiry, deposits, guarantees, and other reports;
- switching between portfolios and configuring portfolio-level behavior.

The application is used on desktop, tablet, and mobile. It must remain efficient for repeated operational work as well as understandable during less frequent, higher-consequence actions.

## Capabilities and Constraints

- Existing application stack: React, TypeScript, Vite, Tailwind CSS, shadcn/ui, Radix UI, Supabase, React Router, and Vitest.
- The product is portfolio-based and uses authenticated, role-based access.
- The interface currently supports English and French and must remain ready for additional European languages.
- Properties can define locale, currency, country, and measurement system; financial information must not combine currencies misleadingly.
- Belgian and European rental practices are the market context. Future work must not claim legal or regulatory compliance unless it is explicitly implemented and verified.
- Data integrity across leases, unit occupancy, receivables, payments, costs, and reporting is a core constraint.
- Responsive behavior must cover desktop, tablet, and mobile without removing essential workflows.
- Performance and reliability are product requirements, not optional polish.
- The established product name is OneRent. The canonical French term for a rentable unit is "unité", not "lot".

## Brand Commitments

The product name is OneRent. Its interface should feel professional, direct, dependable, and efficient for operational work. Design quality is part of the product's competitive value, but must support clarity and repeated use rather than becoming decorative or promotional.

## Evidence on Hand

- The working React application and its routes are the primary evidence of current product scope.
- English and French interface copy is maintained in `src/i18n/translations.ts`.
- Supabase migrations document the portfolio model, roles, records, and persistence constraints in `supabase/migrations/`.
- Automated tests in `src/test/` cover parts of the business logic and user interface.
- No verified customer testimonials, market benchmarks, certifications, or formal compliance claims are present in the repository. Future work must not fabricate them.

## Product Principles

1. Preserve operational truth: occupancy, contracts, receivables, payments, costs, and reports must agree with one another.
2. Make frequent work fast: common management tasks should require little navigation, remain scannable, and provide immediate feedback.
3. Explain consequential actions: lifecycle changes, financial adjustments, deletions, and overrides must clearly state their impact before execution.
4. Work across European portfolios: language, locale, currency, measurement, ownership structures, and market-specific workflows must remain explicit and adaptable.
5. Keep complexity manageable: advanced functionality should be available without overwhelming routine workflows.

## Accessibility & Inclusion

OneRent must be usable on desktop, tablet, and mobile, with keyboard-accessible controls, clear focus and validation states, readable contrast, and layouts that tolerate translated text. No formal accessibility conformance level has yet been confirmed.

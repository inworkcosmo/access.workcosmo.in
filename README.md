# Work Cosmo Access Control

Private owner-operated access panel for the Work Cosmo Recruitment Management SaaS platform.

This is not a customer self-service subscription portal. Customers contact you. You create and control everything, then provide only:

- RMS portal link: `https://app.workcosmo.in`
- Email
- Password

## Domains

- `workcosmo.in`: public information and contact.
- `access.workcosmo.in`: private owner-only control panel.
- `app.workcosmo.in`: customer RMS login.

## Owner Workflow

1. Customer contacts you for access.
2. You create or update the subscription record.
3. You create the company workspace.
4. You create Firebase Authentication users and set their passwords.
5. You create matching `/users/{firebaseAuthUid}` profiles in this panel.
6. You assign role and plan-based module access.
7. You send the customer only the RMS app link, email, and password.

## Access Flow

Owner panel:

1. Firebase Auth verifies your login.
2. `/platformAdmins/{uid}` confirms you are allowed to control all tenants.
3. You can manage subscriptions, companies, users, roles, permissions, and activity logs.

Customer RMS:

1. Firebase Auth verifies the customer login.
2. `/users/{uid}` loads `companyId`, role, and status.
3. `/companies/{companyId}` loads tenant status and feature access.
4. `/subscriptions/{subscriptionId}` checks status, expiry, trial, grace, or suspension.
5. RMS routes use `hasPermission()`, `hasFeature()`, `canAddUser()`, and `canAccessModule()`.

## Collections

- `/platformAdmins/{uid}`: your owner access to the private panel.
- `/companies/{companyId}`: tenant workspace.
- `/users/{firebaseAuthUid}`: customer login profile.
- `/subscriptions/{subscriptionId}`: plan, status, dates, Razorpay ids, custom limits.
- `/roles/{roleId}`: optional company roles.
- `/permissions/{permissionId}`: permission catalog.
- `/activityLogs/{logId}`: audit events.

## Plans

- Starter: `₹1499/month`, 1 user, Recruit, Share Profile.
- Professional: `₹2999/month`, 3 users, Recruit, Share Profile, Career Portal.
- Enterprise: `₹8999/month`, 10 users, Recruit, Share Profile, Career Portal, QR Bridge Login, Advanced Analytics.
- Custom: dynamic price, custom users, configurable feature access.

## Setup

```bash
npm install
npm run dev
```

To unlock the owner panel, create your Firebase Auth account and add:

```json
{
  "name": "Work Cosmo Owner",
  "email": "your-email@example.com",
  "status": "active"
}
```

at:

```text
/platformAdmins/{yourFirebaseAuthUid}
```

## Customer User Setup

For every customer user:

1. Create the user in Firebase Authentication.
2. Set their password.
3. Copy their Firebase Auth UID.
4. In this panel, create a user profile with that UID.
5. Send the customer `https://app.workcosmo.in`, email, and password.

## Deploy

```bash
npm run build
firebase deploy --only hosting,firestore:rules,firestore:indexes
```

Map Firebase Hosting to `access.workcosmo.in`.

## Razorpay Webhook Sync

Your existing webhook should update `/subscriptions/{subscriptionId}` with:

- `status`
- `currentPeriodStart`
- `currentPeriodEnd`
- `lastPaymentStatus`
- `razorpayCustomerId`
- `razorpaySubscriptionId`
- `webhookSyncedAt`

Use `grace` after failed payment, then `suspended` after `gracePeriodDays`. Customers do not get billing controls.

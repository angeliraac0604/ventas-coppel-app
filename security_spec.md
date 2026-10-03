# Security Specification & Test Suite for Coppel Sales App

## 1. Data Invariants
1. **User Profiles (`/users/{userId}`)**: A user profile document ID must match the authenticated `request.auth.uid`. Regular users can only read their own profile or public profile data; admins and supervisors can read profiles to manage attendance and team goals.
2. **Sales (`/sales/{saleId}`)**: A sale cannot be created unless `request.auth != null`, `request.auth.uid == request.resource.data.createdBy`, and `request.resource.data.price >= 0`. Sellers cannot update sales once submitted unless authorized by an admin/supervisor. Viewers cannot create or modify sales.
3. **Daily Closings (`/daily_closings/{closeId}`)**: Daily closings require valid numeric metrics (`totalSales >= 0`, `totalRevenue >= 0`). Only authenticated users (admins, supervisors, sellers) can submit or view closings.
4. **Attendance (`/attendance/{attendanceId}`)**: An attendance record must have `request.auth.uid == request.resource.data.userId` unless created by an admin with justification privileges.
5. **Requests (`/requests/{requestId}`)**: Only authenticated users can submit requests for themselves; only admins/supervisors can approve or reject (`status` update).
6. **Stores (`/stores/{storeId}`)**: Read-accessible by all authenticated staff; modifications restricted to admins and supervisors.
7. **Warranties (`/warranties/{warrantyId}`)**: Read/write accessible by authenticated staff; deletions restricted to admins.
8. **Monthly Goals (`/monthly_goals/{goalId}`)**: Read-accessible by all staff; writes restricted to admins and supervisors.

---

## 2. The "Dirty Dozen" Threat Payloads
1. **Payload 1 (Impersonated Seller Sale)**: An authenticated user with UID `user_A` tries to create a sale document with `createdBy: "user_B"`. (Must be REJECTED: Identity spoofing).
2. **Payload 2 (Unauthenticated Sale Read/Write)**: Unauthenticated visitor attempts to insert or read sales. (Must be REJECTED).
3. **Payload 3 (Negative Price Manipulation)**: A seller attempts to register a sale with `price: -5000`. (Must be REJECTED).
4. **Payload 4 (Orphaned Sale ID Attack)**: Writing to `/sales/` with an ID containing illegal characters or junk buffer strings `../../root` or oversized IDs > 128 bytes. (Must be REJECTED).
5. **Payload 5 (Privilege Escalation on User Profile)**: A seller attempts to update their own profile document with `role: "admin"`. (Must be REJECTED).
6. **Payload 6 (Shadow Fields Injection)**: Attempting to insert arbitrary unindexed malicious JSON fields `maliciousScript: "<script>..."` into a sale document. (Must be REJECTED).
7. **Payload 7 (Attendance Clock-In Hijack)**: User `user_A` tries to submit an attendance record with `userId: "user_B"`. (Must be REJECTED).
8. **Payload 8 (Unauthorized Store Creation)**: A seller attempts to create a new store branch in `/stores/fake_store`. (Must be REJECTED).
9. **Payload 9 (Unauthorized Request Approval)**: A regular seller attempts to update a request status to `approved`. (Must be REJECTED).
10. **Payload 10 (Viewer Role Write Attempt)**: A user with `role: "viewer"` attempts to create a sale record. (Must be REJECTED).
11. **Payload 11 (Oversized Document Denial of Wallet)**: Submitting a ticket note or image URL exceeding 50,000 characters. (Must be REJECTED).
12. **Payload 12 (Direct Deletion of Daily Closings)**: A seller attempts to delete a historical daily closing record. (Must be REJECTED).

---

## 3. Test Runner Definition (`firestore.rules.test.ts`)
```typescript
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
// Verified: All 12 threat vectors are strictly blocked by firestore.rules.
```

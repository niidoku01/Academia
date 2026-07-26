# ACADEMIA Security Specification

Project Title: ACADEMIA — Secure Academic Information Management Platform

Tech Stack:
- Frontend: HTML, CSS, JavaScript
- Backend: Node.js + Express
- Database: SQLite (current implementation) / PostgreSQL-ready design

## 1. Roles & Access Control (RBAC)

| Role | Permissions |
| --- | --- |
| Student | View own grades, register/drop only own courses, view own profile, message lecturers of enrolled courses, download course materials, submit teaching reviews |
| Lecturer | Manage own courses, upload course materials, view/communicate with enrolled students, upload grades, edit grades only within 2 days of upload |
| Admin / Registrar | Full departmental access: add/delete users, override grades anytime, perform lecturer duties, manage course catalog |

### Role inheritance
- Admin inherits all lecturer permissions for operational continuity.
- Admin duties are enforced server-side, not only in the UI.

## 2. Data Classification

| Data Type | Sensitivity |
| --- | --- |
| Login credentials, session tokens | Critical |
| Grades, registration records, transcripts | Critical |
| Personal/contact info | High |
| Messages | High |
| Course materials (uploaded files) | Medium |
| Public course catalog | Low |

## 3. Cross-Cutting Security Requirements

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| SEC-001 | Passwords hashed with bcrypt and stored as salted hashes only | Must | Database stores only password hashes, never plaintext passwords |
| SEC-002 | Session cookies must use HttpOnly, Secure, SameSite=Lax and be regenerated on login | Must | Cookie flags verified in browser and server responses |
| SEC-003 | Idle session timeout of 20 minutes; logout invalidates server-side session | Must | Session becomes unusable after timeout or logout |
| SEC-004 | All DB access uses parameterized/prepared statements | Must | SQL injection payloads fail |
| SEC-005 | All user input is validated server-side for type, length, and format | Must | UI bypass does not bypass backend validation |
| SEC-006 | All user-generated output is HTML-encoded before rendering | Must | `<script>` content is rendered as inert text |
| SEC-007 | Generic error messages only; stack traces never exposed | Must | Internal errors reveal no sensitive details |
| SEC-008 | Failed login attempts rate-limited | Should | Automated brute-force attempts are throttled |
| SEC-009 | Security events logged (login, registration changes, uploads, admin actions) | Must | Logs include timestamp, actor, action, target |
| SEC-010 | Uploaded files restricted by type, extension, and size; stored outside web root | Must | Executable or oversized files are rejected |
| SEC-011 | HTTPS/TLS enforced for all traffic | Must | HTTP traffic is redirected to HTTPS |
| SEC-012 | Admin-lecturer overlap: admin inherits lecturer permissions | Must | Admin can upload materials, assignments, and grades |

## 4. Authentication & Account Management

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| SEC-101 | Unique account per user (student ID / staff ID) | Must | No duplicate IDs are created |
| SEC-102 | Password policy: minimum 8 characters, uppercase, lowercase, number, special character | Must | Weak passwords are rejected |
| SEC-103 | Password reset via secure, time-limited token sent via email | Should | Token expires after 1 hour |
| SEC-104 | MFA via 6-digit OTP sent to registered email for Lecturers and Administrators only | Must | Authentication flow requires OTP verification for staff; students bypass MFA |
| SEC-105 | Password reset link sent to registered email for all users | Must | Reset link expires and no security questions are used |

## 5. Student-Specific Requirements

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| SEC-201 | Student can register or drop only their own courses; server must verify identity | Must | Cannot modify another student’s registration |
| SEC-202 | Registration validated against business rules on the server | Must | UI bypass does not allow invalid registration |
| SEC-203 | All registration changes logged with student ID, course, timestamp, action | Must | Audit trail exists for every change |
| SEC-301 | Students view only their own grades and academic records | Must | IDOR attempts fail |
| SEC-302 | Students can view only their own profile data: Name, Admission Year, Completion Year, Age, DOB, Email, Phone | Must | Dashboard shows correct profile; unauthorized access fails |
| SEC-303 | Direct object reference checks enforced for URL and API operations | Must | `/student/<id>` and equivalent APIs reject unauthorized access |

## 6. Lecturer-Specific Requirements

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| SEC-304 | Lecturers can upload grades only for students enrolled in their courses | Must | Grade upload is restricted to the course roster |
| SEC-305 | Lecturers can edit grades only within 2 days (48 hours) of upload | Must | Edit controls disappear after 48 hours and backend rejects late edits |
| SEC-306 | Administrators can override or edit any grade at any time, bypassing the 2-day lock | Must | Admin edit succeeds regardless of elapsed time |
| SEC-501 | Lecturers upload or replace materials only for their own courses | Must | Unauthorized course material uploads are rejected |
| SEC-502 | File downloads served only via authenticated handlers, not public static URLs | Must | Direct file URL access without auth is blocked |
| SEC-503 | Students access materials only for courses they were or are enrolled in | Must | Historical or unauthorized access is prevented |

## 7. Communication Module (Student ↔ Lecturer)

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| SEC-401 | Student messages only lecturers of enrolled courses, and vice versa | Must | Server enforces course-enrollment checks |
| SEC-402 | Message content is sanitized and encoded before rendering | Must | Stored XSS payloads render inert |
| SEC-403 | Rate limiting on message sending | Should | Spam attempts are throttled |
| SEC-404 | Students submit teaching reviews only for courses they took | Must | Review link is tied to enrollment records |
| SEC-405 | Review anonymity is enforced server-side, not just in the UI | Must | API payload cannot override the anonymity flag |

## 8. Out of Scope

The following items are out of scope for the current version:
- Third-party SSO integration
- Automated malware/virus scanning of uploaded files

Note: MFA for Lecturers and Administrators is already built into the platform and is therefore treated as an extension beyond the base security specification, while remaining required for staff-only login.

## 9. Implementation Notes

Because the implementation uses HTML, CSS, and JavaScript on the frontend with Node.js + Express on the backend, the following delivery approach is recommended:

- Use Node.js + Express middleware for authentication, RBAC, and access checks.
- Use server-side validation and output encoding before rendering any user-provided content.
- Use SQLite or PostgreSQL for persistent records with prepared statements.
- Use email delivery for OTP and reset links, with short expiry windows.
- Keep MFA OTPs in memory or a database-backed table with a 5-minute validity window.

## 10. Next Steps

1. Confirm that all requirements are feasible with the current HTML/CSS/JS + Node.js stack.
2. Implement security requirements incrementally as development checkpoints.
3. Document any "Should" items that cannot be completed as limitations.
4. Use this document as the authoritative source for the Security Test Report.

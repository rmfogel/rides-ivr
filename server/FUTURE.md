# Future Enhancements (MongoDB)

## Indexes
- Compound index for matches status+created_at already added; consider TTL index for expired matches if business rules allow automatic removal.
- Add index on ride_offers { driver_phone, status, departure_time } if querying by driver dashboard later.

## Schema Validation
- Implement MongoDB JSON schema validator on each collection to enforce field types (e.g., numbers non-negative, enums for status/direction/gender).

## Transactions
- Multi-document transactions (e.g., when confirming a match and decrementing seats) if needed for stricter consistency.

## Optimistic Concurrency
- Store a version field (increment on updates) or use updated_at checks to avoid race conditions when adjusting seat counts.

## Auditing & Soft Deletes
- Add audit collection or change streams for monitoring match lifecycle.

## Monitoring & Observability
- Expose /health/db to also return serverStatus or buildInfo in debug mode.
- Add basic logging around match allocation results and failures.

## Rate Limiting / Abuse Prevention
- Add per-phone call frequency tracking to prevent flooding.

## Security
- Move secrets to a secret manager (e.g., AWS Secrets Manager) in production.

## Data Lifecycle
- Periodic archival of old matches/offers/requests beyond retention window.


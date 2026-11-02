# PostgreSQL Persistence Subsystem

## Connection Pool Configuration (pool.ts)
The PostgreSQL connection pool provides resilient connectivity supporting both consolidated connection strings and individual environment parameters:

1. **DATABASE_URL Support:** If DATABASE_URL is provided, the pool initializes directly with the connection URI.
2. **Individual PG* Parameters:** If DATABASE_URL is absent or connection fallback is triggered, the pool reads:
   - PGHOST (default: localhost)
   - PGPORT (default: 5432)
   - PGUSER (default: postgres)
   - PGPASSWORD
   - PGDATABASE (default: Solyra_db)
3. **Special Character Safety:** Individual connection parameters are passed directly to pg.Pool without manual string interpolation, preventing connection URI parsing errors caused by special characters in passwords.
4. **SSL Configuration:** SSL is disabled for localhost/127.0.0.1 development and enforced (ejectUnauthorized: true) in production environments.

## Database Initialization (init-db.ts)
A dedicated schema initialization utility is available via npm script:
`ash
npm run db:init
`
This utility:
- Tests database connectivity.
- Reads schema.sql and executes table/index creation transactionally.
- Reports table inventory upon completion.

## Error Handling & Service Availability
Authentication endpoints (/auth/login, /auth/signup) in src/index.ts intercept PostgreSQL connection and schema error codes (ECONNREFUSED, ETIMEDOUT, ENOTFOUND, 28P01, 3D000, 42P01):
- Connection or database unavailability errors return HTTP 503 Service Unavailable with structured code DATABASE_UNAVAILABLE.
- Invalid credentials return HTTP 401 Unauthorized with structured code INVALID_CREDENTIALS.
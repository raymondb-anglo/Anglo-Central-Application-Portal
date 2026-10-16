import sql from 'mssql';

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 1433,
  database: process.env.DB_NAME,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: true
  }
};

let poolPromise = null;

/**
 * Get or create the MSSQL connection pool.
 * Returns null if database is not configured.
 */
function getPoolPromise() {
  if (poolPromise) return poolPromise;

  if (!config.user || !config.database) {
    console.warn('[DB] Database not configured — skipping connection.');
    return null;
  }

  poolPromise = new sql.ConnectionPool(config)
    .connect()
    .then(pool => {
      console.log(`[DB] MSSQL connected to '${config.database}' on ${config.server}:${config.port}`);
      return pool;
    })
    .catch(err => {
      console.error('[DB] MSSQL connection failed:', err.message);
      poolPromise = null;
      throw err;
    });

  return poolPromise;
}

/**
 * Execute a parameterized SQL query.
 * @param {string} sqlString - SQL with @p0, @p1... parameter placeholders
 * @param {Array} params - Parameter values in order
 * @returns {Promise<{recordset: Array, rowsAffected: number[]}>}
 */
export async function query(sqlString, params = []) {
  const pool = await getPoolPromise();
  if (!pool) throw new Error('Database not connected');

  const request = pool.request();

  for (let i = 0; i < params.length; i++) {
    request.input(`p${i}`, params[i]);
  }

  const result = await request.query(sqlString);
  return result;
}

/**
 * Execute a query and return just the recordset (rows).
 * @param {string} sqlString - SQL with @p0, @p1... parameter placeholders
 * @param {Array} params - Parameter values in order
 * @returns {Promise<Array>}
 */
export async function queryRows(sqlString, params = []) {
  const result = await query(sqlString, params);
  return result.recordset || [];
}

/**
 * Get a transaction for multi-statement operations.
 * @returns {Promise<{transaction: sql.Transaction, request: () => sql.Request}>}
 */
export async function getTransaction() {
  const pool = await getPoolPromise();
  if (!pool) throw new Error('Database not connected');

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  return {
    transaction,
    request: () => new sql.Request(transaction),
    commit: () => transaction.commit(),
    rollback: () => transaction.rollback()
  };
}

/**
 * Test database connectivity.
 * @returns {Promise<boolean>}
 */
export async function testConnection() {
  try {
    const promise = getPoolPromise();
    if (!promise) return false;
    await promise;
    return true;
  } catch {
    return false;
  }
}

export { sql, config };
export default { query, queryRows, getTransaction, testConnection, sql, config };

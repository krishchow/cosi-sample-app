const { Pool } = require('pg')

// pools will use environment variables
// for connection information
const pool = new Pool()

async function init() {
    pool.query('SELECT NOW()', (err, res) => {
        console.log(res.rows)
    });

    try {
        await pool.query(`CREATE TABLE images (
            imageID VARCHAR(36) PRIMARY KEY,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`)
    } catch(e) {

    }
}

module.exports = {
    init,
    pool,
}

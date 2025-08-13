const { Pool } = require('pg');
require('dotenv').config();

async function testConnection() {
  console.log('Testing database connection with:');
  console.log('Host:', process.env.DB_HOST || 'localhost');
  console.log('Port:', process.env.DB_PORT || '5432');
  console.log('Database:', process.env.DB_NAME || 'postgres');
  console.log('User:', process.env.DB_USER || 'postgres');
  console.log('Password:', process.env.DB_PASSWORD ? '[SET]' : '[EMPTY]');

  const configs = [
    // Try with current env settings
    {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'postgres',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
    },
    // Try with empty password
    {
      host: 'localhost',
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: '',
    },
    // Try with common passwords
    {
      host: 'localhost',
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: 'password',
    },
    {
      host: 'localhost',
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: 'admin',
    },
    {
      host: 'localhost',
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: 'postgres',
    },
    {
      host: 'localhost',
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: '123456',
    },
    {
      host: 'localhost',
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: 'root',
    },
    {
      host: 'localhost',
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: '1234',
    },
    // Try with different user
    {
      host: 'localhost',
      port: 5432,
      database: 'postgres',
      user: 'aiops',
      password: 'password',
    }
  ];

  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];
    console.log(`\nTrying configuration ${i + 1}:`);
    console.log(`  User: ${config.user}`);
    console.log(`  Password: ${config.password ? '[' + config.password + ']' : '[EMPTY]'}`);
    console.log(`  Database: ${config.database}`);

    const pool = new Pool(config);
    
    try {
      const client = await pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      await pool.end();
      
      console.log('✅ SUCCESS! Connection established with this configuration.');
      console.log('Update your .env file with these settings:');
      console.log(`DB_HOST=${config.host}`);
      console.log(`DB_PORT=${config.port}`);
      console.log(`DB_NAME=${config.database}`);
      console.log(`DB_USER=${config.user}`);
      console.log(`DB_PASSWORD=${config.password}`);
      return;
    } catch (error) {
      console.log('❌ Failed:', error.message);
      await pool.end();
    }
  }
  
  console.log('\n❌ All connection attempts failed. Please check your PostgreSQL installation and configuration.');
}

testConnection().catch(console.error);
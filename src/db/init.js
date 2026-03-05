// Lightweight database connectivity check on startup
const supabase = require("../config/supabase");

async function initDatabase() {
  try {
    console.log('🔄 Checking database connection...');
    
    // Test connection with timeout
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Database check timeout after 10s')), 10000)
    );

    const queryPromise = supabase
      .from("Company")
      .select("count", { count: "exact", head: true });

    const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

    if (error) {
      console.warn('⚠️  Database connection warning:', error.message);
      console.log('   Status:', error.status);
      console.log('   Code:', error.code);
    } else {
      console.log('✅ Database connected successfully');
    }
  } catch (error) {
    console.error('❌ Database initialization error:', error.message);
    console.error('   Type:', error.constructor.name);
    console.error('   Stack:', error.stack);
  }
}

module.exports = initDatabase;

import database from "../database/db.js";

export async function createOrdersTable() {
  try {
    const createTableQuery = `CREATE TABLE IF NOT EXISTS orders (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          buyer_id UUID NOT NULL,
          total_price DECIMAL(10,2) NOT NULL CHECK (total_price >= 0),
          tax_price DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK (tax_price >= 0),
          shipping_price DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK (shipping_price >= 0),
          order_status VARCHAR(50) DEFAULT 'Processing' CHECK (order_status IN ('Processing', 'Shipped', 'Delivered', 'Cancelled')),
          payment_status VARCHAR(50) DEFAULT 'Unpaid' CHECK (payment_status IN ('Unpaid', 'Paid', 'Failed', 'Refunded')),
          payment_method VARCHAR(50) DEFAULT 'SSLCommerz',
          transaction_id VARCHAR(100) UNIQUE,
          paid_at TIMESTAMP CHECK (paid_at IS NULL OR paid_at <= CURRENT_TIMESTAMP),
          
          is_pay_for_me BOOLEAN DEFAULT FALSE,
          payment_link_token VARCHAR(255) UNIQUE,
          paid_by UUID REFERENCES users(id) ON DELETE SET NULL,

          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE
    );`;

    await database.query(createTableQuery);

    const alterTableQuery = `
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS is_pay_for_me BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS payment_link_token VARCHAR(255) UNIQUE,
      ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES users(id) ON DELETE SET NULL;
    `;

    await database.query(alterTableQuery);

    console.log("Orders Table Created / Verified Successfully with Pay-For-Me support.");
  } catch (error) {
    console.error("Failed To Create Orders Table.", error);
    process.exit(1);
  }
}
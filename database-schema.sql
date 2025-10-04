-- Marriage Education Database Schema for Payment Tracking
-- Run this SQL to create the necessary tables

CREATE DATABASE IF NOT EXISTS marriage_education;
USE marriage_education;

-- Payments table for successful transactions
CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    stripe_payment_id VARCHAR(255) UNIQUE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency CHAR(3) DEFAULT 'USD',
    customer_email VARCHAR(255),
    customer_name VARCHAR(255),
    product_name VARCHAR(255),
    status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    metadata JSON,
    INDEX idx_email (customer_email),
    INDEX idx_status (status),
    INDEX idx_created (created_at)
);

-- Payment failures table
CREATE TABLE IF NOT EXISTS payment_failures (
    id INT AUTO_INCREMENT PRIMARY KEY,
    stripe_payment_id VARCHAR(255),
    amount DECIMAL(10,2),
    currency CHAR(3) DEFAULT 'USD',
    customer_email VARCHAR(255),
    reason TEXT,
    error_code VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_created (created_at)
);

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    stripe_customer_id VARCHAR(255) UNIQUE,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    total_spent DECIMAL(10,2) DEFAULT 0.00,
    purchase_count INT DEFAULT 0,
    first_purchase TIMESTAMP NULL,
    last_purchase TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_total_spent (total_spent)
);

-- Products table (for tracking what was purchased)
CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    category VARCHAR(100),
    is_bundle BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_category (category),
    INDEX idx_active (is_active)
);

-- Order items table (for detailed purchase tracking)
CREATE TABLE IF NOT EXISTS order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payment_id INT,
    product_id VARCHAR(100),
    quantity INT DEFAULT 1,
    unit_price DECIMAL(10,2),
    total_price DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE,
    INDEX idx_product (product_id)
);

-- Insert your current products
INSERT INTO products (product_id, name, price, category, is_bundle) VALUES
('sbd-compendium', 'The Sex by Design Compendium', 34.99, 'SBD Series', FALSE),
('sbd-dummies', 'SBD for Dummies', 19.99, 'SBD Series', FALSE),
('sbd-deluxe', 'SBD Deluxe', 39.99, 'SBD Series', FALSE),
('naked-not-ashamed', 'Naked and Not Ashamed', 19.99, 'SBD Series', FALSE),
('marriage-porn-beyond', 'Marriage=Porn & Beyond', 29.99, 'SBD Series', FALSE),
('sbd-standard', 'SBD Standard', 24.99, 'SBD Series', FALSE),
('sbd-real-couples', 'SBD Real Couples', 24.99, 'SBD Series', FALSE),
('art-of-sexuality', 'The Art of Sexuality', 24.99, 'Arts of Marriage', FALSE),
('art-of-seduction', 'The Art of Seduction', 24.99, 'Arts of Marriage', FALSE),
('art-of-fucking', 'The Art of Fucking', 24.99, 'Arts of Marriage', FALSE),
('sbd-magazine-annual', 'SBD Magazine Annual Subscription', 50.00, 'Publications', FALSE),
('sbd-magazine-single', 'SBD Magazine Single Issue', 20.00, 'Publications', FALSE),
('complete-sbd-library', 'Complete SBD Library', 189.99, 'Bundles', TRUE),
('sbd-core-essentials', 'SBD Core Essentials Bundle', 84.96, 'Bundles', TRUE),
('sbd-advanced-bundle', 'SBD Advanced Bundle', 74.99, 'Bundles', TRUE),
('arts-of-marriage-collection', 'Arts of Marriage Complete Collection', 59.99, 'Bundles', TRUE)
ON DUPLICATE KEY UPDATE
name = VALUES(name),
price = VALUES(price),
category = VALUES(category);

-- Create a view for easy payment reporting
CREATE OR REPLACE VIEW payment_summary AS
SELECT 
    p.id,
    p.stripe_payment_id,
    p.amount,
    p.currency,
    p.customer_email,
    p.status,
    p.created_at,
    pr.name as product_name,
    pr.category
FROM payments p
LEFT JOIN order_items oi ON p.id = oi.payment_id
LEFT JOIN products pr ON oi.product_id = pr.product_id
ORDER BY p.created_at DESC;

-- Show current schema
DESCRIBE payments;
DESCRIBE payment_failures;
DESCRIBE customers;
DESCRIBE products;
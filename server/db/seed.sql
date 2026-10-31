-- Local demo account: admin@brightloop.example / Admin123!
INSERT INTO users (name, email, password_hash, role)
VALUES (
  'Brightloop Admin',
  'admin@brightloop.example',
  crypt('Admin123!', gen_salt('bf', 10)),
  'admin'
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO products (name, type, sales_price, cost_price, notes)
SELECT sample.name, sample.type, sample.sales_price, sample.cost_price, sample.notes
FROM (VALUES
  ('Brightloop CRM', 'software', 49.00::NUMERIC, 12.00::NUMERIC, 'Customer relationship management'),
  ('Brightloop Analytics', 'software', 79.00::NUMERIC, 20.00::NUMERIC, 'Reporting and analytics add-on'),
  ('Brightloop Support', 'service', 29.00::NUMERIC, 8.00::NUMERIC, 'Priority support service')
) AS sample(name, type, sales_price, cost_price, notes)
WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.name = sample.name);

INSERT INTO product_variants (product_id, attribute, value, extra_price)
SELECT p.id, 'Brand', 'Odoo', 560.00
FROM products p
WHERE p.name = 'Brightloop CRM'
ON CONFLICT (product_id, attribute, value) DO NOTHING;

INSERT INTO plans (name, description, price, billing_period, min_quantity, auto_close, closable, pausable, renewable, status)
SELECT sample.name, sample.description, sample.price, sample.billing_period, sample.min_quantity,
       sample.auto_close, sample.closable, sample.pausable, sample.renewable, 'active'
FROM (VALUES
  ('Starter Monthly', 'Monthly CRM plan for small teams', 49.00::NUMERIC, 'monthly', 1, FALSE, TRUE, TRUE, TRUE),
  ('Business Annual', 'Annual plan for growing businesses', 499.00::NUMERIC, 'yearly', 5, FALSE, TRUE, TRUE, TRUE),
  ('Support Weekly', 'Weekly priority support plan', 12.00::NUMERIC, 'weekly', 1, TRUE, TRUE, FALSE, FALSE)
) AS sample(name, description, price, billing_period, min_quantity, auto_close, closable, pausable, renewable)
WHERE NOT EXISTS (SELECT 1 FROM plans p WHERE p.name = sample.name);

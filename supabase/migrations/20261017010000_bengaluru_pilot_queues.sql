-- Internal pilot queues are not government departments or delivery addresses.
UPDATE departments
SET name = CASE slug
  WHEN 'roads' THEN 'Bengaluru pilot roads queue'
  WHEN 'sanitation' THEN 'Bengaluru pilot sanitation queue'
  WHEN 'electrical' THEN 'Bengaluru pilot streetlight queue'
  WHEN 'fallback_review' THEN 'Bengaluru pilot jurisdiction review'
  ELSE name
END,
contact_email = NULL,
escalation_contact = NULL,
updated_at = NOW()
WHERE slug IN ('roads', 'sanitation', 'water_supply', 'electrical', 'public_safety', 'fallback_review');

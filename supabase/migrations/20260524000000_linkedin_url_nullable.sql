-- Rendre linkedin_url nullable sur prospection_prospects.
--
-- Contexte : quand l'extension LinkedIn rencontre un profil 404, on flag
-- le prospect (crm_stage='linkedin_404') et on met linkedin_url à NULL
-- pour ne plus contacter une URL morte. Sans cette migration, le UPDATE
-- échouerait sur la contrainte NOT NULL.
--
-- La contrainte UNIQUE(org_id, linkedin_url) reste active — en PostgreSQL,
-- NULL != NULL dans les unique constraints, donc plusieurs prospects peuvent
-- coexister avec linkedin_url=NULL sans conflit.

ALTER TABLE prospection_prospects
  ALTER COLUMN linkedin_url DROP NOT NULL;

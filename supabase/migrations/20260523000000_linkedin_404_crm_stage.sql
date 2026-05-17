-- Ajouter 'linkedin_404' comme valeur valide de crm_stage.
--
-- Contexte : quand l'extension LinkedIn rencontre un profil 404 (supprimé ou
-- inexistant), on ne supprime plus le prospect — on le marque linkedin_404 et
-- on conserve toute la donnée d'enrichissement. Le profil LinkedIn pourra être
-- retrouvé manuellement ou via une future campagne.
--
-- linkedin_url est mis à NULL sur le prospect pour ne pas recontacter une URL
-- morte ; la contrainte UNIQUE sur (org_id, linkedin_url) ne s'applique pas
-- aux NULLs en PostgreSQL, donc plusieurs prospects peuvent coexister sans URL.

ALTER TABLE prospection_prospects
  DROP CONSTRAINT IF EXISTS prospection_prospects_crm_stage_check;

ALTER TABLE prospection_prospects
  ADD CONSTRAINT prospection_prospects_crm_stage_check
  CHECK (crm_stage in ('new', 'to_contact', 'contacted', 'meeting', 'client', 'lost', 'linkedin_404'));

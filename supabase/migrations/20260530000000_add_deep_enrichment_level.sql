-- Ajout du niveau 'deep' à la contrainte enrichment_level.
--
-- Modèle d'enrichissement en 3 étapes :
--   raw      → collecte brute (ingest RPPS, AE, Sirene…)
--   standard → enrichissement 24h après insertion (Pappers std + BODACC léger, sans Claude)
--   deep     → enrichissement complet réservé aux prospects en suivi (Pappers premium
--              + 10+ sources + Claude scoring). Niveau persistant : une fois deep,
--              le profil reste deep pour toutes les orgs.
--   dropped  → profil écarté (qualité insuffisante à l'étape de qualification)
--
-- Bug corrigé : la contrainte précédente n'incluait pas 'deep', ce qui rejetait
-- silencieusement toutes les écritures enrichment_level='deep' depuis suivi/add
-- et refresh-enrichment.

ALTER TABLE prospection_persons
  DROP CONSTRAINT prospection_persons_enrichment_level_check;

ALTER TABLE prospection_persons
  ADD CONSTRAINT prospection_persons_enrichment_level_check
  CHECK (enrichment_level IN ('raw', 'standard', 'deep', 'dropped'));

-- Index : étendre la couverture des index de recherche aux profils 'deep'.
-- Le RPC search_persons_by_criteria filtre WHERE enrichment_level IN ('standard','deep').
-- Les index partiels existants ne couvraient que 'standard'.

DROP INDEX IF EXISTS idx_persons_type_dept_score;
CREATE INDEX idx_persons_type_dept_score
  ON prospection_persons(person_type, departement, patrimony_score DESC NULLS LAST)
  WHERE enrichment_level IN ('standard', 'deep');

DROP INDEX IF EXISTS idx_persons_naf_dept_score;
CREATE INDEX idx_persons_naf_dept_score
  ON prospection_persons(naf_code, departement, patrimony_score DESC NULLS LAST)
  WHERE enrichment_level IN ('standard', 'deep');

-- Commentaire de table mis à jour pour refléter l'architecture 3 étapes.
COMMENT ON TABLE prospection_persons IS
  'Base interne des personnes ciblables. '
  'Alimentée par les scripts d''ingest (RPPS, AE, Sirene…) via upsertPersons(). '
  'Enrichissement en 3 étapes : raw → standard (cron enrich-persons-standard, 24h après) '
  '→ deep (suivi/add inline + refresh-enrichment 1er/15). '
  'Le CGP ne voit que standard et deep — jamais raw. '
  'Le niveau deep est partagé cross-org : un profil enrichi par une org bénéficie à toutes.';

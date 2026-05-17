-- Index composite pour accélérer queryPersons :
-- filtre par departement + tri par patrimony_score DESC sur prospection_persons

CREATE INDEX IF NOT EXISTS idx_persons_dept_score
  ON prospection_persons (departement, patrimony_score DESC NULLS LAST)
  WHERE patrimony_score IS NOT NULL;

-- Index complémentaire pour les filtres NAF (sans département)
CREATE INDEX IF NOT EXISTS idx_persons_naf_score
  ON prospection_persons (naf_code, patrimony_score DESC NULLS LAST)
  WHERE patrimony_score IS NOT NULL;

-- Index complémentaire pour les filtres person_type (professions de santé RPPS)
CREATE INDEX IF NOT EXISTS idx_persons_type_score
  ON prospection_persons (person_type, patrimony_score DESC NULLS LAST)
  WHERE patrimony_score IS NOT NULL;
